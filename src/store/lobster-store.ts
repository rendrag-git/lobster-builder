import { create } from 'zustand'
import {
  lobsterRunWorkflow,
  lobsterPublishWorkflow,
  lobsterResume,
  lobsterList,
  lobsterStatus,
  lobsterCancel,
  lobsterUnschedule,
  lobsterSetScheduleEnabled,
  normalizePublishedWorkflowList,
} from '../lib/lobster-service'
import type { LobsterEnvelope, LobsterPublishedWorkflow, LobsterRunHandle, LobsterWorkflowScheduleOptions } from '../lib/lobster-service'
import type { GatewayConfig } from '../lib/gateway-client'
import { useGatewayStore } from './gateway-store'

export type LobsterExecStatus = 'idle' | 'running' | 'approval' | 'success' | 'error' | 'cancelled'
export type PublishedWorkflowsStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LobsterOperation = 'run' | 'deploy' | 'resume' | 'status' | 'cancel' | 'schedule' | 'unschedule'

interface HaltedWorkflow {
  id: string
  workflowName?: string
  status: string
  approvalPrompt?: string
  createdAt?: string
}

interface LobsterState {
  execStatus: LobsterExecStatus
  lastResult: LobsterEnvelope | null
  lastError: string | null
  lastOperation: LobsterOperation | null
  currentRun: LobsterRunHandle | null
  publishedWorkflows: LobsterPublishedWorkflow[]
  publishedWorkflowsGatewayKey: string | null
  publishedWorkflowsStatus: PublishedWorkflowsStatus
  publishedWorkflowsError: string | null
  haltedWorkflows: HaltedWorkflow[]
  pendingResumeGatewayConfig: GatewayConfig | null

  run: (workflowYaml: string, opts?: { argsJson?: string; cwd?: string; name?: string; gatewayConfig?: GatewayConfig }) => Promise<void>
  publish: (workflowYaml: string, opts?: {
    id?: string
    name?: string
    cwd?: string
    metadata?: unknown
    schedule?: LobsterWorkflowScheduleOptions
    gatewayConfig?: GatewayConfig
  }) => Promise<LobsterEnvelope | null>
  resume: (resumeRef: { token?: string; approvalId?: string }, approve: boolean, opts?: { gatewayConfig?: GatewayConfig }) => Promise<void>
  list: (opts?: { gatewayConfig?: GatewayConfig }) => Promise<void>
  refreshPublishedWorkflows: (opts?: { gatewayConfig?: GatewayConfig }) => Promise<void>
  status: (id: string, opts?: { gatewayConfig?: GatewayConfig }) => Promise<LobsterEnvelope | null>
  cancel: (id: string, opts?: { gatewayConfig?: GatewayConfig }) => Promise<void>
  unschedule: (id: string, opts?: { gatewayConfig?: GatewayConfig }) => Promise<LobsterEnvelope | null>
  setScheduleEnabled: (id: string, enabled: boolean, opts?: { gatewayConfig?: GatewayConfig }) => Promise<LobsterEnvelope | null>
  reset: () => void
}

function getConfig() {
  const config = useGatewayStore.getState().config
  if (!config) throw new Error('Gateway not connected')
  return config
}

export function gatewayConfigKey(config: GatewayConfig): string {
  return config.id?.trim() || config.url?.trim() || config.name?.trim() || 'gateway'
}

function execStatusForResult(result: LobsterEnvelope): LobsterExecStatus {
  if (!result.ok) return 'error'
  if (result.requiresApproval) return 'approval'
  const runStatus = result.run?.status
  return execStatusForRunStatus(runStatus, 'success')
}

function execStatusForRunStatus(runStatus: string | undefined, fallback: LobsterExecStatus = 'running'): LobsterExecStatus {
  if (!runStatus) return fallback
  if (runStatus === 'cancelled') return 'cancelled'
  if (runStatus === 'failed' || runStatus === 'lost') return 'error'
  if (runStatus === 'succeeded') return 'success'
  return 'running'
}

export const useLobsterStore = create<LobsterState>((set, get) => ({
  execStatus: 'idle',
  lastResult: null,
  lastError: null,
  lastOperation: null,
  currentRun: null,
  publishedWorkflows: [],
  publishedWorkflowsGatewayKey: null,
  publishedWorkflowsStatus: 'idle',
  publishedWorkflowsError: null,
  haltedWorkflows: [],
  pendingResumeGatewayConfig: null,

  run: async (workflowYaml, opts) => {
    set({ execStatus: 'running', lastError: null, lastResult: null, lastOperation: 'run', currentRun: null, pendingResumeGatewayConfig: null })
    try {
      const { gatewayConfig, ...runOpts } = opts ?? {}
      const targetGateway = gatewayConfig ?? getConfig()
      const result = await lobsterRunWorkflow(targetGateway, workflowYaml, runOpts)
      set({
        lastResult: result,
        currentRun: result.run ?? null,
        execStatus: result.ok
          ? result.requiresApproval
            ? 'approval'
            : 'success'
          : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
        pendingResumeGatewayConfig: result.ok && result.requiresApproval ? targetGateway : null,
      })
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
        currentRun: null,
        pendingResumeGatewayConfig: null,
      })
    }
  },

  publish: async (workflowYaml, opts) => {
    set({ execStatus: 'running', lastError: null, lastResult: null, lastOperation: 'deploy', pendingResumeGatewayConfig: null })
    try {
      const { gatewayConfig, ...publishOpts } = opts ?? {}
      const result = await lobsterPublishWorkflow(gatewayConfig ?? getConfig(), workflowYaml, publishOpts)
      set({
        lastResult: result,
        execStatus: result.ok ? 'success' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
      })
      return result
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  },

  resume: async (resumeRef, approve, opts) => {
    set({ execStatus: 'running', lastError: null, lastOperation: 'resume' })
    try {
      const result = await lobsterResume(
        opts?.gatewayConfig ?? get().pendingResumeGatewayConfig ?? getConfig(),
        resumeRef,
        approve,
        { run: get().currentRun },
      )
      set({
        lastResult: result,
        currentRun: result.run ?? get().currentRun,
        execStatus: execStatusForResult(result),
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
        pendingResumeGatewayConfig: result.ok && result.requiresApproval
          ? (opts?.gatewayConfig ?? get().pendingResumeGatewayConfig ?? getConfig())
          : null,
      })
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  list: async (opts) => {
    try {
      const targetGateway = opts?.gatewayConfig ?? getConfig()
      const result = await lobsterList(targetGateway)
      const publishedWorkflows = normalizePublishedWorkflowList(result)
      set({
        publishedWorkflows,
        publishedWorkflowsGatewayKey: gatewayConfigKey(targetGateway),
        publishedWorkflowsStatus: result.ok ? 'ready' : 'error',
        publishedWorkflowsError: result.ok ? null : (result.error?.message ?? 'Could not load published workflows.'),
        haltedWorkflows: result.ok && Array.isArray(result.output)
          ? result.output.map((w) => {
              const wf = w as Record<string, unknown>
              return {
                id: String(wf.id ?? ''),
                workflowName: wf.workflowName as string | undefined,
                status: String(wf.status ?? 'unknown'),
                approvalPrompt: wf.approvalPrompt as string | undefined,
                createdAt: wf.createdAt as string | undefined,
              }
            })
          : [],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message, publishedWorkflowsStatus: 'error', publishedWorkflowsError: message })
    }
  },

  refreshPublishedWorkflows: async (opts) => {
    set({ publishedWorkflowsStatus: 'loading', publishedWorkflowsError: null })
    try {
      const targetGateway = opts?.gatewayConfig ?? getConfig()
      const result = await lobsterList(targetGateway)
      set({
        publishedWorkflows: normalizePublishedWorkflowList(result),
        publishedWorkflowsGatewayKey: gatewayConfigKey(targetGateway),
        publishedWorkflowsStatus: result.ok ? 'ready' : 'error',
        publishedWorkflowsError: result.ok ? null : (result.error?.message ?? 'Could not load published workflows.'),
      })
    } catch (err) {
      set({
        publishedWorkflowsStatus: 'error',
        publishedWorkflowsError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  status: async (id, opts) => {
    try {
      const result = await lobsterStatus(opts?.gatewayConfig ?? getConfig(), id)
      if (result.run) {
        const runStatus = result.run.status
        set({
          currentRun: result.run,
          lastResult: result,
          lastOperation: 'status',
          execStatus: execStatusForRunStatus(runStatus),
          lastError: runStatus === 'failed' || runStatus === 'lost'
            ? (result.error?.message ?? `Run ${runStatus}.`)
            : null,
        })
      }
      return result
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  cancel: async (id, opts) => {
    try {
      const result = await lobsterCancel(opts?.gatewayConfig ?? getConfig(), id)
      set({
        lastResult: result,
        lastOperation: 'cancel',
        currentRun: result.run ?? get().currentRun,
        execStatus: result.ok ? 'cancelled' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Cancel failed'),
      })
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) })
    }
  },

  unschedule: async (id, opts) => {
    set({ execStatus: 'running', lastError: null, lastOperation: 'unschedule' })
    try {
      const targetGateway = opts?.gatewayConfig ?? getConfig()
      const result = await lobsterUnschedule(targetGateway, id)
      set({
        lastResult: result,
        lastOperation: 'unschedule',
        execStatus: result.ok ? 'success' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
      })
      await get().list({ gatewayConfig: targetGateway })
      return result
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  },

  setScheduleEnabled: async (id, enabled, opts) => {
    set({ execStatus: 'running', lastError: null, lastOperation: 'schedule' })
    try {
      const result = await lobsterSetScheduleEnabled(opts?.gatewayConfig ?? getConfig(), id, enabled)
      set({
        lastResult: result,
        lastOperation: 'schedule',
        execStatus: result.ok ? 'success' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
      })
      return result
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  },

  reset: () => {
    set({ execStatus: 'idle', lastResult: null, lastError: null, lastOperation: null, currentRun: null, pendingResumeGatewayConfig: null })
  },
}))
