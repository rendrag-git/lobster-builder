import { callGatewayRpc, invokeGatewayTool } from './gateway-client'
import type { GatewayConfig } from './gateway-client'

export type LobsterAction = 'run' | 'resume' | 'publish' | 'list' | 'unschedule'

export interface LobsterRunHandle {
  flowId: string
  revision?: number
  status?: string
  goal?: string
  currentStep?: string
  cancelRequestedAt?: number
}

export interface LobsterEnvelope {
  ok: boolean
  status?: string
  output?: unknown[]
  run?: LobsterRunHandle
  error?: { type?: string; message: string }
  requiresApproval?: {
    type: string
    prompt: string
    items: unknown[]
    resumeToken?: string
    approvalId?: string
  } | null
}

export interface LobsterWorkflowScheduleOptions {
  cron: string
  timezone?: string
  enabled?: boolean
  jobId?: string
  sessionKey: string
  agentId?: string
  toolsAllow?: string[]
}

export interface LobsterWorkflowScheduleRecord {
  jobId: string
  workflowId: string
  revision: number
  cron: string
  timezone?: string
  sessionKey: string
  agentId?: string
  toolsAllow: string[]
}

export interface LobsterPublishedWorkflow {
  workflowId: string
  name?: string
  revision?: number
  status?: string
  updatedAt?: string
  bundleMode?: string
  reusable?: boolean
  workflowRefs?: string[]
}

const READ_RPC_OPTIONS = { scopes: ['operator.read'] }
const WRITE_RPC_OPTIONS = { scopes: ['operator.read', 'operator.write'], caps: ['tool-events'] }
const ADMIN_RPC_OPTIONS = { scopes: ['operator.admin'], caps: ['tool-events'] }
const MANAGED_RUN_CONTROLLER_ID = 'lobster-builder/test-run'

function workflowOutput(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [payload]
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.workflows)) return record.workflows
  if (record.workflow) {
    return record.schedule && record.workflow && typeof record.workflow === 'object' && !Array.isArray(record.workflow)
      ? [{ ...record.workflow, schedule: record.schedule }]
      : [record.workflow]
  }
  return [payload]
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}

export function normalizePublishedWorkflow(value: unknown): LobsterPublishedWorkflow | null {
  const record = asRecord(value)
  const workflowId = stringValue(record?.workflowId) ?? stringValue(record?.id)
  if (!workflowId) return null

  const metadata = asRecord(record?.metadata)
  const openclaw = asRecord(metadata?.openclaw) ?? asRecord(record?.openclaw)
  const bundle = asRecord(openclaw?.bundle) ?? asRecord(metadata?.bundle)
  const name = stringValue(record?.name)
  const revision = numberValue(record?.revision)
  const status = stringValue(record?.status)
  const updatedAt = stringValue(record?.updatedAt)
  const bundleMode = stringValue(bundle?.mode)
  const reusable = booleanValue(bundle?.reusable)
  const workflowRefs = stringArrayValue(bundle?.workflowRefs)

  return {
    workflowId,
    ...(name ? { name } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(status ? { status } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(bundleMode ? { bundleMode } : {}),
    ...(reusable !== undefined ? { reusable } : {}),
    ...(workflowRefs ? { workflowRefs } : {}),
  }
}

export function normalizePublishedWorkflowList(envelope: LobsterEnvelope): LobsterPublishedWorkflow[] {
  if (!envelope.ok || !Array.isArray(envelope.output)) return []
  return envelope.output
    .map(normalizePublishedWorkflow)
    .filter((workflow): workflow is LobsterPublishedWorkflow => workflow !== null)
}

function flowStatusFromEnvelopeStatus(status: string | undefined): string | undefined {
  if (status === 'needs_approval') return 'waiting'
  if (status === 'error') return 'failed'
  if (status === 'ok') return 'succeeded'
  return status
}

function runHandleFromFlow(value: unknown): LobsterRunHandle | undefined {
  const flow = asRecord(value)
  const flowId = stringValue(flow?.flowId) ?? stringValue(flow?.id)
  if (!flowId) return undefined
  return {
    flowId,
    ...(numberValue(flow?.revision) !== undefined ? { revision: numberValue(flow?.revision) } : {}),
    ...(stringValue(flow?.status) ? { status: stringValue(flow?.status) } : {}),
    ...(stringValue(flow?.goal) ? { goal: stringValue(flow?.goal) } : {}),
    ...(stringValue(flow?.currentStep) ? { currentStep: stringValue(flow?.currentStep) } : {}),
    ...(numberValue(flow?.cancelRequestedAt) !== undefined ? { cancelRequestedAt: numberValue(flow?.cancelRequestedAt) } : {}),
  }
}

function runHandleFromManagedDetails(details: Record<string, unknown>): LobsterRunHandle | undefined {
  const mutation = asRecord(details.mutation)
  return runHandleFromFlow(mutation?.flow) ?? runHandleFromFlow(details.flow)
}

function normalizeToolsAllow(toolsAllow: string[] | undefined): string[] {
  const extras = new Set<string>()
  for (const tool of toolsAllow ?? []) {
    const normalized = tool.trim()
    if (normalized && normalized !== 'lobster') extras.add(normalized)
  }
  return ['lobster', ...[...extras].sort()]
}

function workflowCronMessage(params: { workflowId: string; revision: number; name?: string }): string {
  const label = params.name ? ` (${params.name})` : ''
  return [
    `Run published Lobster workflow "${params.workflowId}"${label}.`,
    'Use the lobster tool exactly once with this JSON:',
    JSON.stringify({
      action: 'run',
      workflowId: params.workflowId,
      workflowRevision: params.revision,
    }),
    'Do not replace the workflow with shell commands. If policy blocks lobster or a nested tool, report the policy error.',
  ].join('\n')
}

function envelopeFromWorkflowRpc(payload: unknown, status: string): LobsterEnvelope {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
  if (record.ok === false) {
    const error = record.error && typeof record.error === 'object'
      ? record.error as { type?: string; message?: string }
      : null
    return {
      ok: false,
      status: 'error',
      error: {
        type: error?.type,
        message: error?.message ?? `${status} failed`,
      },
    }
  }
  return {
    ok: true,
    status,
    output: workflowOutput(payload),
    requiresApproval: null,
  }
}

function envelopeFromRunFlowRpc(payload: unknown, status: string): LobsterEnvelope {
  const record = asRecord(payload) ?? {}
  const flow = runHandleFromFlow(record.flow)
  if (record.found === false) {
    return {
      ok: false,
      status: 'not_found',
      error: {
        type: 'not_found',
        message: stringValue(record.reason) ?? 'Flow not found.',
      },
    }
  }
  return {
    ok: true,
    status: flow?.status ?? status,
    output: [payload],
    ...(flow ? { run: flow } : {}),
    requiresApproval: null,
  }
}

function envelopeFromLobsterToolOutput(payload: unknown): LobsterEnvelope {
  const record = asRecord(payload)
  const details = asRecord(record?.details)
  if (details) {
    const envelope = asRecord(details.envelope) ?? details
    const run = runHandleFromManagedDetails(details)
    const ok = envelope.ok !== false
    const status = stringValue(envelope.status) ?? flowStatusFromEnvelopeStatus(stringValue(envelope.status))
    const error = asRecord(envelope.error)
    const requiresApproval =
      (asRecord(envelope.requiresApproval) as LobsterEnvelope['requiresApproval']) ?? null
    return {
      ok,
      status,
      output: Array.isArray(envelope.output) ? envelope.output : workflowOutput(envelope),
      ...(run ? { run } : {}),
      ...(!ok
        ? {
            error: {
              type: stringValue(error?.type),
              message: stringValue(error?.message) ?? 'Lobster run failed',
            },
          }
        : {}),
      requiresApproval,
    }
  }

  if (record && typeof record.ok === 'boolean') {
    return payload as LobsterEnvelope
  }

  return {
    ok: true,
    status: 'ok',
    output: workflowOutput(payload),
    requiresApproval: null,
  }
}

export async function lobsterInvoke(
  config: GatewayConfig,
  action: LobsterAction,
  args: Record<string, unknown> = {},
): Promise<LobsterEnvelope> {
  if (action === 'publish') {
    const result = await callGatewayRpc(config, 'lobster.workflow.publish', args, WRITE_RPC_OPTIONS)
    return envelopeFromWorkflowRpc(result, 'published')
  }
  if (action === 'list') {
    const result = await callGatewayRpc(config, 'lobster.workflow.list', args, READ_RPC_OPTIONS)
    return envelopeFromWorkflowRpc(result, 'ok')
  }
  if (action === 'unschedule') {
    return {
      ok: false,
      status: 'unsupported',
      error: {
        type: 'unsupported',
        message: 'OpenClaw-native workflow unschedule is not implemented yet.',
      },
    }
  }

  const result = await invokeGatewayTool(config, 'lobster', { action, ...args })
  return envelopeFromLobsterToolOutput(result)
}

export async function lobsterRun(
  config: GatewayConfig,
  pipeline: string,
  opts?: { argsJson?: string; cwd?: string },
): Promise<LobsterEnvelope> {
  return lobsterInvoke(config, 'run', {
    pipeline,
    ...opts,
  })
}

export async function lobsterRunWorkflow(
  config: GatewayConfig,
  workflowYaml: string,
  opts?: { argsJson?: string; cwd?: string; name?: string },
): Promise<LobsterEnvelope> {
  return lobsterInvoke(config, 'run', {
    workflowYaml,
    flowControllerId: MANAGED_RUN_CONTROLLER_ID,
    flowGoal: opts?.name ? `Run Lobster workflow: ${opts.name}` : 'Run Lobster workflow',
    flowCurrentStep: 'run_lobster',
    flowWaitingStep: 'await_lobster_approval',
    ...opts,
  })
}

export async function lobsterPublishWorkflow(
  config: GatewayConfig,
  workflowYaml: string,
  opts?: {
    id?: string
    name?: string
    cwd?: string
    metadata?: unknown
    schedule?: LobsterWorkflowScheduleOptions
  },
): Promise<LobsterEnvelope> {
  const publishResult = await lobsterInvoke(config, 'publish', {
    workflowYaml,
    workflowId: opts?.id,
    id: opts?.id,
    name: opts?.name,
    cwd: opts?.cwd,
    ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
  })
  const requestedSchedule = opts?.schedule
  if (!requestedSchedule || requestedSchedule.enabled === false || !publishResult.ok) {
    return publishResult
  }

  const workflow = asRecord(publishResult.output?.[0])
  const workflowId = stringValue(workflow?.workflowId) ?? opts?.id
  const revision = numberValue(workflow?.revision)
  if (!workflowId || revision === undefined) {
    throw new Error('Published workflow response did not include workflowId and revision for scheduling.')
  }

  try {
    const schedule = await lobsterScheduleWorkflow(
      config,
      {
        workflowId,
        revision,
        name: stringValue(workflow?.name) ?? opts?.name,
      },
      requestedSchedule,
    )

    return {
      ...publishResult,
      output: [{ ...(workflow ?? { workflowId, revision }), schedule }],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ...publishResult,
      ok: false,
      status: 'schedule_error',
      output: [{ ...(workflow ?? { workflowId, revision }), scheduleError: message }],
      error: {
        type: 'schedule_error',
        message: `Workflow deployed, but cron scheduling failed: ${message}`,
      },
      requiresApproval: null,
    }
  }
}

export async function lobsterScheduleWorkflow(
  config: GatewayConfig,
  workflow: { workflowId: string; revision: number; name?: string },
  schedule: LobsterWorkflowScheduleOptions,
): Promise<LobsterWorkflowScheduleRecord> {
  const toolsAllow = normalizeToolsAllow(schedule.toolsAllow)
  const cronJobParams = {
    name: `lobster:${workflow.workflowId}`,
    enabled: schedule.enabled ?? true,
    schedule: {
      kind: 'cron',
      expr: schedule.cron,
      ...(schedule.timezone ? { tz: schedule.timezone } : {}),
    },
    sessionTarget: 'isolated',
    ...(schedule.agentId ? { agentId: schedule.agentId } : {}),
    sessionKey: schedule.sessionKey,
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message: workflowCronMessage(workflow),
      toolsAllow,
    },
    delivery: { mode: 'none' },
  }
  const cronJob = schedule.jobId
    ? await callGatewayRpc(config, 'cron.update', {
        id: schedule.jobId,
        patch: cronJobParams,
      }, ADMIN_RPC_OPTIONS)
    : await callGatewayRpc(config, 'cron.add', cronJobParams, ADMIN_RPC_OPTIONS)
  const job = asRecord(cronJob)
  const jobId = stringValue(job?.id)
  if (!jobId) {
    throw new Error(`OpenClaw ${schedule.jobId ? 'cron.update' : 'cron.add'} did not return a CronJob id.`)
  }
  return {
    jobId,
    workflowId: workflow.workflowId,
    revision: workflow.revision,
    cron: schedule.cron,
    ...(schedule.timezone ? { timezone: schedule.timezone } : {}),
    sessionKey: schedule.sessionKey,
    ...(schedule.agentId ? { agentId: schedule.agentId } : {}),
    toolsAllow,
  }
}

export async function lobsterSetScheduleEnabled(
  config: GatewayConfig,
  jobId: string,
  enabled: boolean,
): Promise<LobsterEnvelope> {
  const result = await callGatewayRpc(config, 'cron.update', {
    id: jobId,
    patch: { enabled },
  }, ADMIN_RPC_OPTIONS)
  return envelopeFromWorkflowRpc(result, enabled ? 'schedule-resumed' : 'schedule-paused')
}

export async function lobsterResume(
  config: GatewayConfig,
  resumeRef: { token?: string; approvalId?: string },
  approve: boolean,
  opts?: { run?: LobsterRunHandle | null },
): Promise<LobsterEnvelope> {
  return lobsterInvoke(config, 'resume', {
    ...resumeRef,
    approve,
    ...(opts?.run?.flowId && opts.run.revision !== undefined
      ? {
          flowId: opts.run.flowId,
          flowExpectedRevision: opts.run.revision,
          flowCurrentStep: 'resume_lobster',
          flowWaitingStep: 'await_lobster_approval',
        }
      : {}),
  })
}

export async function lobsterList(
  config: GatewayConfig,
): Promise<LobsterEnvelope> {
  return lobsterInvoke(config, 'list')
}

export async function lobsterStatus(
  config: GatewayConfig,
  id: string,
): Promise<LobsterEnvelope> {
  const result = await callGatewayRpc(config, 'tasks.flows.get', { flowId: id }, READ_RPC_OPTIONS)
  return envelopeFromRunFlowRpc(result, 'ok')
}

export async function lobsterCancel(
  config: GatewayConfig,
  id: string,
): Promise<LobsterEnvelope> {
  const result = await callGatewayRpc(config, 'tasks.flows.cancel', { flowId: id }, WRITE_RPC_OPTIONS)
  return envelopeFromRunFlowRpc(result, 'cancelled')
}

export async function lobsterUnschedule(
  config: GatewayConfig,
  jobId: string,
): Promise<LobsterEnvelope> {
  const result = await callGatewayRpc(config, 'cron.remove', { id: jobId }, ADMIN_RPC_OPTIONS)
  return envelopeFromWorkflowRpc(result, 'unscheduled')
}
