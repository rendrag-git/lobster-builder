import { compile } from '../compiler/compile'
import { compileToYaml } from '../compiler/toYaml'
import { useWorkflowStore } from '../store/workflow-store'
import { resolveWorkflowGatewayConfig, useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import { validateWorkflowReadiness } from '../lib/workflow-readiness'
import type { WorkflowReadiness } from '../lib/workflow-readiness'
import type { GatewayConfig } from '../lib/gateway-client'
import type { LobsterWorkflowFile } from '../types/lobster'

function publishedScheduleJobId(result: { output?: unknown[] } | null): string | null {
  const firstOutput = result?.output?.[0]
  if (!firstOutput || typeof firstOutput !== 'object' || Array.isArray(firstOutput)) return null
  const schedule = (firstOutput as Record<string, unknown>).schedule
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return null
  const jobId = (schedule as Record<string, unknown>).jobId
  return typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null
}

function hasPublishedWorkflowOutput(result: { output?: unknown[] } | null): boolean {
  return Boolean(result?.output?.some((item) => (
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).workflowId === 'string'
  )))
}

export interface WorkflowGatewayActions {
  yaml: string
  error: string
  compiledWorkflow: LobsterWorkflowFile | null
  targetGateway: GatewayConfig | null
  targetGatewayLabel: string
  readiness: WorkflowReadiness | null
  hasRunnableWorkflow: boolean
  scheduleEnabled: boolean
  canRun: boolean
  canDeploy: boolean
  busy: boolean
  baseDisabledReason: string | null
  deployDisabledReason: string | null
  run: () => void
  deploy: () => void
}

export function useWorkflowGatewayActions(): WorkflowGatewayActions {
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
  const refreshPublishedWorkflows = useLobsterStore((s) => s.refreshPublishedWorkflows)
  const execStatus = useLobsterStore((s) => s.execStatus)

  let yaml = ''
  let error = ''
  let compiledWorkflow: LobsterWorkflowFile | null = null
  try {
    yaml = compileToYaml(nodes, edges, workflowMeta)
    compiledWorkflow = compile(nodes, edges, workflowMeta)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const targetGateway = resolveWorkflowGatewayConfig(workflowMeta, gateways, gatewayConfig)
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
  const readinessBlockedMessage = readiness?.messages.at(-1) ?? 'Resolve OpenClaw readiness issues before deploying.'
  const scheduleEnabled = Boolean(workflowMeta.schedule?.enabled && workflowMeta.schedule?.cron?.trim())
  const scheduleSessionKey = discovery?.effectiveTools?.sessionKey
  const scheduleBlocksDeploy = scheduleEnabled && !scheduleSessionKey
  const busy = execStatus === 'running' || execStatus === 'approval'
  const canRun = !!targetGateway && hasRunnableWorkflow && !busy && !readinessBlocksRun
  const canDeploy = canRun && !scheduleBlocksDeploy
  const targetGatewayLabel = targetGateway?.name ?? targetGateway?.url ?? 'selected gateway'
  const baseDisabledReason = !targetGateway
    ? 'Connect or select a gateway first.'
    : !hasRunnableWorkflow
      ? 'Add at least one node before running or deploying.'
      : readinessBlocksRun
        ? readinessBlockedMessage
        : execStatus === 'approval'
          ? 'Resolve the pending approval before starting another gateway action.'
          : busy
          ? 'Wait for the current gateway command to finish.'
          : null
  const deployDisabledReason = baseDisabledReason ?? (
    scheduleBlocksDeploy
      ? 'Deploy + Cron requires gateway discovery to identify the invoking agent session.'
      : null
  )

  const run = () => {
    if (!hasRunnableWorkflow || !compiledWorkflow || busy || !targetGateway) return
    const workflow = compiledWorkflow
    const argsJson = workflow.args
      ? JSON.stringify(Object.fromEntries(
          Object.entries(workflow.args).map(([k, v]) => [k, v.default ?? ''])
        ))
      : undefined
    lobsterRun(yaml, { argsJson, cwd: workflow.cwd, name: workflow.name, gatewayConfig: targetGateway })
  }

  const deploy = () => {
    if (!hasRunnableWorkflow || !compiledWorkflow || busy || !targetGateway) return
    const workflow = compiledWorkflow
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
      if (result?.ok || hasPublishedWorkflowOutput(result)) {
        void refreshPublishedWorkflows({ gatewayConfig: targetGateway })
      }
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

  return {
    yaml,
    error,
    compiledWorkflow,
    targetGateway,
    targetGatewayLabel,
    readiness,
    hasRunnableWorkflow,
    scheduleEnabled,
    canRun,
    canDeploy,
    busy,
    baseDisabledReason,
    deployDisabledReason,
    run,
    deploy,
  }
}
