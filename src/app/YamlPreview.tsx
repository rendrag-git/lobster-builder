import { useState } from 'react'
import { Copy, Check, Terminal, Play, Loader2, UploadCloud, Pause, Trash2, X } from 'lucide-react'
import { useWorkflowStore } from '../store/workflow-store'
import { resolveWorkflowGatewayConfig, useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import { compileToYaml } from '../compiler/toYaml'
import { compile } from '../compiler/compile'
import { Tooltip } from '../components/Tooltip'
import { validateWorkflowReadiness, type WorkflowReadiness } from '../lib/workflow-readiness'
import type { GatewayConfig } from '../lib/gateway-client'
import type { LobsterEnvelope } from '../lib/lobster-service'

function ReadinessPanel({ readiness }: { readiness: WorkflowReadiness }) {
  if (readiness.requiredTools.length === 0 && readiness.messages.length === 0) return null

  const tone = readiness.status === 'blocked'
    ? {
        border: 'border-red-900/70',
        bg: 'bg-red-950/30',
        title: 'text-red-300',
        text: 'text-red-200',
        pill: 'border-red-800 bg-red-950 text-red-200',
        label: 'Blocked',
      }
    : readiness.status === 'warning'
      ? {
          border: 'border-yellow-900/70',
          bg: 'bg-yellow-950/30',
          title: 'text-yellow-300',
          text: 'text-yellow-100',
          pill: 'border-yellow-800 bg-yellow-950 text-yellow-200',
          label: 'Check needed',
        }
      : {
          border: 'border-cyan-900/70',
          bg: 'bg-cyan-950/30',
          title: 'text-cyan-300',
          text: 'text-cyan-100',
          pill: 'border-cyan-800 bg-cyan-950 text-cyan-200',
          label: 'Ready',
        }

  return (
    <div
      className={`border-b ${tone.border} ${tone.bg} px-3 py-2 text-xs`}
      data-testid="workflow-readiness"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${tone.title}`}>OpenClaw readiness</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tone.pill}`}>
          {tone.label}
        </span>
      </div>
      {readiness.requiredTools.length > 0 ? (
        <div className={`mt-1 ${tone.text}`}>
          Requires {readiness.requiredTools.join(' + ')}
        </div>
      ) : null}
      {readiness.requiredChannels.length > 0 ? (
        <div className={`mt-1 ${tone.text}`}>
          Channels {readiness.requiredChannels.join(' + ')}
        </div>
      ) : null}
      <ul className="mt-1 space-y-0.5 text-gray-400">
        {readiness.messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}

function ExecutionResult({ gatewayConfig }: { gatewayConfig: GatewayConfig | null }) {
  const { execStatus, lastResult, lastError, currentRun } = useLobsterStore()
  const resume = useLobsterStore((s) => s.resume)
  const cancel = useLobsterStore((s) => s.cancel)
  const reset = useLobsterStore((s) => s.reset)

  if (execStatus === 'idle') return null

  const approval = lastResult?.requiresApproval
  const approvalRef = approval
    ? approval.resumeToken
      ? { token: approval.resumeToken }
      : approval.approvalId
        ? { approvalId: approval.approvalId }
        : null
    : null

  return (
    <div className="border-t border-gray-800 p-3 space-y-2">
      {/* Status line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {execStatus === 'running' && <Loader2 size={11} className="animate-spin text-blue-400" />}
          <span className={`text-xs font-medium ${
            execStatus === 'success' ? 'text-green-400' :
            execStatus === 'cancelled' ? 'text-yellow-400' :
            execStatus === 'error' ? 'text-red-400' :
            execStatus === 'approval' ? 'text-yellow-400' :
            'text-blue-400'
          }`}>
            {execStatus === 'running' ? 'Running...' :
             execStatus === 'success' ? 'Completed' :
             execStatus === 'cancelled' ? 'Cancelled' :
             execStatus === 'error' ? 'Failed' :
             'Approval Required'}
          </span>
        </div>
        {execStatus !== 'running' && (
          <button
            onClick={reset}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Error */}
      {lastError && (
        <p className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">{lastError}</p>
      )}

      {currentRun && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-950 px-2 py-1 text-[10px] text-gray-400"
          data-testid="lobster-run-handle"
        >
          <div className="min-w-0">
            <span className="font-semibold text-gray-300">Run</span>
            <span className="ml-2 font-mono text-gray-500">{currentRun.flowId}</span>
            {currentRun.status ? <span className="ml-2 text-gray-400">{currentRun.status}</span> : null}
          </div>
          {currentRun.status && !['succeeded', 'failed', 'cancelled', 'lost'].includes(currentRun.status) ? (
            <Tooltip content="Cancel this managed OpenClaw TaskFlow through tasks.flows.cancel.">
              <button
                type="button"
                onClick={() => cancel(currentRun.flowId)}
                disabled={execStatus === 'running'}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-yellow-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="cancel-run-btn"
              >
                <X size={11} />
                <span>Cancel</span>
              </button>
            </Tooltip>
          ) : null}
        </div>
      )}

      {/* Approval prompt */}
      {execStatus === 'approval' && approval && (
        <div className="space-y-2">
          <p className="text-xs text-gray-300">{approval.prompt}</p>
          <div className="flex gap-2">
            <button
              onClick={() => approvalRef && resume(approvalRef, true, gatewayConfig ? { gatewayConfig } : undefined)}
              disabled={!approvalRef}
              className="flex-1 py-1 text-xs bg-green-700 hover:bg-green-600 rounded text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve
            </button>
            <button
              onClick={() => approvalRef && resume(approvalRef, false, gatewayConfig ? { gatewayConfig } : undefined)}
              disabled={!approvalRef}
              className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Output */}
      {execStatus === 'success' && lastResult?.output && lastResult.output.length > 0 && (
        <pre className="text-[10px] text-gray-400 font-mono bg-gray-950 rounded p-2 max-h-32 overflow-auto">
          {JSON.stringify(lastResult.output, null, 2)}
        </pre>
      )}
    </div>
  )
}

function publishedScheduleJobId(result: LobsterEnvelope | null): string | null {
  const firstOutput = result?.output?.[0]
  if (!firstOutput || typeof firstOutput !== 'object' || Array.isArray(firstOutput)) return null
  const schedule = (firstOutput as Record<string, unknown>).schedule
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return null
  const jobId = (schedule as Record<string, unknown>).jobId
  return typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null
}

function ScheduleControls() {
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)
  const execStatus = useLobsterStore((s) => s.execStatus)
  const setScheduleEnabled = useLobsterStore((s) => s.setScheduleEnabled)
  const unschedule = useLobsterStore((s) => s.unschedule)
  const schedule = workflowMeta.schedule
  const jobId = schedule?.jobId?.trim()
  if (!jobId) return null
  const currentSchedule = schedule ?? {}

  const busy = execStatus === 'running'
  const updateSchedule = (enabled: boolean) => {
    void setScheduleEnabled(jobId, enabled).then((result) => {
      if (!result?.ok) return
      setWorkflowMeta({
        schedule: {
          ...currentSchedule,
          enabled,
        },
      })
    })
  }
  const removeSchedule = () => {
    void unschedule(jobId).then((result) => {
      if (!result?.ok) return
      setWorkflowMeta({
        schedule: {
          ...currentSchedule,
          enabled: false,
          jobId: undefined,
        },
      })
    })
  }

  return (
    <div
      className="border-b border-gray-800 bg-gray-950/60 px-3 py-2 text-xs text-gray-400"
      data-testid="schedule-controls"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-gray-300">Cron job</span>
          <span className="ml-2 font-mono text-gray-500">{jobId}</span>
        </div>
        <div className="flex items-center gap-1">
          {schedule?.enabled ? (
            <Tooltip content="Pause the existing OpenClaw cron job with cron.update patch.enabled=false.">
              <button
                type="button"
                onClick={() => updateSchedule(false)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-yellow-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="pause-schedule-btn"
              >
                <Pause size={11} />
                <span>Pause</span>
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Resume the existing OpenClaw cron job with cron.update patch.enabled=true.">
              <button
                type="button"
                onClick={() => updateSchedule(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-green-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="resume-schedule-btn"
              >
                <Play size={11} />
                <span>Resume</span>
              </button>
            </Tooltip>
          )}
          <Tooltip content="Remove the existing OpenClaw cron job with cron.remove. The published workflow document remains on the gateway.">
            <button
              type="button"
              onClick={removeSchedule}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="remove-schedule-btn"
            >
              <Trash2 size={11} />
              <span>Remove</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

export function YamlPreview() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)
  const gatewayStatus = useGatewayStore((s) => s.status)
  const gatewayConfig = useGatewayStore((s) => s.config)
  const gateways = useGatewayStore((s) => s.gateways)
  const discovery = useGatewayStore((s) => s.discovery)
  const lobsterRun = useLobsterStore((s) => s.run)
  const lobsterPublish = useLobsterStore((s) => s.publish)
  const execStatus = useLobsterStore((s) => s.execStatus)

  const [copiedYaml, setCopiedYaml] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)

  let yaml = ''
  let error = ''
  try {
    yaml = compileToYaml(nodes, edges, workflowMeta)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const copyYaml = async () => {
    if (!yaml) return
    await navigator.clipboard.writeText(yaml)
    setCopiedYaml(true)
    setTimeout(() => setCopiedYaml(false), 2000)
  }

  const copyCmd = async () => {
    const cmd = `lobster run --file workflow.lobster`
    await navigator.clipboard.writeText(cmd)
    setCopiedCmd(true)
    setTimeout(() => setCopiedCmd(false), 2000)
  }

  const targetGateway = resolveWorkflowGatewayConfig(workflowMeta, gateways, gatewayConfig)
  const compiledWorkflow = (() => {
    try {
      return compile(nodes, edges, workflowMeta)
    } catch {
      return null
    }
  })()
  const readiness = compiledWorkflow
    ? validateWorkflowReadiness({
        workflow: compiledWorkflow,
        targetGateway,
        activeGateway: gatewayConfig,
        gatewayStatus,
        discovery,
      })
    : null
  const hasRunnableWorkflow = Boolean(yaml && compiledWorkflow?.steps.length)
  const readinessBlocksRun = readiness?.blocksRun ?? false
  const readinessBlockedMessage = readiness?.messages.at(-1) ?? 'Resolve OpenClaw readiness issues before running or publishing.'
  const workflowCanSendChannelMessage = readiness?.requiredTools.includes('message') ?? false
  const scheduleEnabled = Boolean(workflowMeta.schedule?.enabled && workflowMeta.schedule?.cron?.trim())
  const scheduleSessionKey = discovery?.effectiveTools?.sessionKey
  const scheduleBlocksPublish = scheduleEnabled && !scheduleSessionKey
  const canRun = !!targetGateway && hasRunnableWorkflow && execStatus !== 'running' && !readinessBlocksRun
  const canPublish = canRun && !scheduleBlocksPublish

  const handleRun = () => {
    if (!hasRunnableWorkflow || !compiledWorkflow || execStatus === 'running') return
    const workflow = compiledWorkflow
    const argsJson = workflow.args
      ? JSON.stringify(Object.fromEntries(
          Object.entries(workflow.args).map(([k, v]) => [k, v.default ?? ''])
        ))
      : undefined
    if (!targetGateway) return
    lobsterRun(yaml, { argsJson, cwd: workflow.cwd, name: workflow.name, gatewayConfig: targetGateway })
  }

  const handlePublish = () => {
    if (!hasRunnableWorkflow || !compiledWorkflow || execStatus === 'running') return
    const workflow = compiledWorkflow
    if (!targetGateway) return
    void lobsterPublish(yaml, {
      id: workflowMeta.bundle?.id,
      name: workflow.name,
      cwd: workflow.cwd,
      metadata: workflow.openclaw,
      schedule: scheduleEnabled && discovery?.effectiveTools?.sessionKey
        ? {
            enabled: true,
            cron: workflowMeta.schedule?.cron?.trim() ?? '',
            timezone: workflowMeta.schedule?.timezone?.trim() || undefined,
            jobId: workflowMeta.schedule?.jobId,
            sessionKey: discovery.effectiveTools.sessionKey,
            agentId: discovery.effectiveTools.agentId,
            toolsAllow: readiness?.requiredTools,
          }
        : undefined,
      gatewayConfig: targetGateway,
    }).then((result) => {
      const jobId = publishedScheduleJobId(result)
      if (!jobId || !workflowMeta.schedule) return
      setWorkflowMeta({
        schedule: {
          ...workflowMeta.schedule,
          jobId,
        },
      })
    })
  }
  const targetGatewayLabel = targetGateway?.name ?? targetGateway?.url ?? 'selected gateway'
  const baseDisabledReason = !targetGateway
    ? 'Connect or select a gateway first.'
    : !hasRunnableWorkflow
      ? 'Add at least one node before running or publishing.'
      : readinessBlocksRun
        ? readinessBlockedMessage
      : execStatus === 'running'
        ? 'Wait for the current gateway command to finish.'
        : null
  const publishDisabledReason = baseDisabledReason ?? (
    scheduleBlocksPublish
      ? 'Publish + Cron requires gateway discovery to identify the invoking agent session.'
      : null
  )
  const runTitle = !targetGateway
    ? 'Connect or select a gateway first'
    : gatewayStatus !== 'connected'
      ? `Direct test run via ${targetGateway.name ?? targetGateway.url}`
      : 'Direct test run via gateway'
  const publishTitle = !targetGateway
    ? 'Connect or select a gateway first'
    : scheduleEnabled
      ? `Publish and schedule workflow on ${targetGateway.name ?? targetGateway.url}`
      : `Publish workflow to ${targetGateway.name ?? targetGateway.url}`
  const runTooltip = (
    <>
      <span className="block font-medium text-green-300">Test Run</span>
      <span className="mt-1 block">
        Calls the existing <span className="font-mono">lobster</span> tool on {targetGatewayLabel}; inline YAML is materialized as a workflow file before execution.
      </span>
      <span className="mt-1 block text-gray-500">
        {workflowCanSendChannelMessage
          ? 'This does not start an agent turn. Native message steps can post to the configured OpenClaw channel.'
          : 'Result output appears in this panel only. This does not start an agent turn or post to a channel.'}
      </span>
      {baseDisabledReason ? <span className="mt-1 block text-yellow-300">{baseDisabledReason}</span> : null}
    </>
  )
  const publishTooltip = (
    <>
      <span className="block font-medium text-blue-300">
        {scheduleEnabled ? 'Publish + Cron' : 'Publish'}
      </span>
      <span className="mt-1 block">
        Sends the YAML to <span className="font-mono">lobster.workflow.publish</span> on the selected gateway.
      </span>
      <span className="mt-1 block text-gray-500">
        {scheduleEnabled
          ? 'Schedule metadata asks OpenClaw to create or update a gateway cron job. Builder does not choose a Discord delivery target yet.'
          : 'Publish stores the workflow artifact. It does not run it, start an agent turn, or post to Discord.'}
      </span>
      {publishDisabledReason ? <span className="mt-1 block text-yellow-300">{publishDisabledReason}</span> : null}
    </>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">YAML Preview</span>
        <div className="flex gap-1">
          <Tooltip content={runTooltip} testId="run-workflow-tooltip">
            <button
              onClick={handleRun}
              disabled={!canRun}
              title={runTitle}
              className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:text-green-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="run-workflow-btn"
            >
              {execStatus === 'running' ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              <span>Test Run</span>
            </button>
          </Tooltip>
          <Tooltip content={publishTooltip} testId="publish-workflow-tooltip">
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              title={publishTitle}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="publish-workflow-btn"
            >
              {execStatus === 'running' ? <Loader2 size={11} className="animate-spin" /> : <UploadCloud size={11} />}
              <span>{scheduleEnabled ? 'Publish + Cron' : 'Publish'}</span>
            </button>
          </Tooltip>
          <Tooltip
            content="Copies a local lobster CLI command. Its printed output appears in the terminal where you run it, not in Builder or Discord."
            testId="copy-command-tooltip"
          >
            <button
              onClick={copyCmd}
              title="Copy local lobster CLI command"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            >
              <Terminal size={11} />
              {copiedCmd ? <Check size={11} className="text-green-400" /> : null}
            </button>
          </Tooltip>
          <Tooltip
            content="Copies the .lobster YAML artifact. This is the file content that Publish sends to the gateway."
            testId="copy-yaml-tooltip"
          >
            <button
              onClick={copyYaml}
              disabled={!yaml}
              title="Copy .lobster YAML"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors disabled:opacity-40"
            >
              {copiedYaml ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              <span>{copiedYaml ? 'Copied' : 'Copy'}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {readiness && <ReadinessPanel readiness={readiness} />}
      <ScheduleControls />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="p-3 text-xs text-red-400 font-mono whitespace-pre-wrap">
            Error: {error}
          </div>
        ) : !hasRunnableWorkflow ? (
          <div className="p-3 text-xs text-gray-600 italic">
            Add nodes or executable bundle refs to see YAML output.
          </div>
        ) : (
          <pre
            className="p-3 text-xs text-gray-300 font-mono whitespace-pre overflow-x-auto leading-relaxed"
            data-testid="yaml-preview-content"
          >
            {yaml}
          </pre>
        )}
      </div>

      {/* Execution result */}
      <ExecutionResult gatewayConfig={targetGateway} />
    </div>
  )
}
