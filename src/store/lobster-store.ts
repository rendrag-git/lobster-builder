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
  currentRun: LobsterRunHandle | null
  publishedWorkflows: LobsterPublishedWorkflow[]
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
  list: () => Promise<void>
  refreshPublishedWorkflows: (opts?: { gatewayConfig?: GatewayConfig }) => Promise<void>
  status: (id: string) => Promise<LobsterEnvelope | null>
  cancel: (id: string) => Promise<void>
  unschedule: (id: string) => Promise<LobsterEnvelope | null>
  setScheduleEnabled: (id: string, enabled: boolean) => Promise<LobsterEnvelope | null>
  reset: () => void
}

function getConfig() {
  const config = useGatewayStore.getState().config
  if (!config) throw new Error('Gateway not connected')
  return config
}

export const useLobsterStore = create<LobsterState>((set, get) => ({
  execStatus: 'idle',
  lastResult: null,
  lastError: null,
  currentRun: null,
  publishedWorkflows: [],
  publishedWorkflowsStatus: 'idle',
  publishedWorkflowsError: null,
  haltedWorkflows: [],
  pendingResumeGatewayConfig: null,

  run: async (workflowYaml, opts) => {
    set({ execStatus: 'running', lastError: null, lastResult: null, currentRun: null, pendingResumeGatewayConfig: null })
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
    set({ execStatus: 'running', lastError: null, lastResult: null, pendingResumeGatewayConfig: null })
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
    set({ execStatus: 'running', lastError: null })
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
        execStatus: result.ok ? 'success' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
        pendingResumeGatewayConfig: null,
      })
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  list: async () => {
    try {
      const result = await lobsterList(getConfig())
      const publishedWorkflows = normalizePublishedWorkflowList(result)
      set({
        publishedWorkflows,
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
      const result = await lobsterList(opts?.gatewayConfig ?? getConfig())
      set({
        publishedWorkflows: normalizePublishedWorkflowList(result),
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

  status: async (id) => {
    try {
      const result = await lobsterStatus(getConfig(), id)
      if (result.run) set({ currentRun: result.run, lastResult: result })
      return result
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  cancel: async (id) => {
    try {
      const result = await lobsterCancel(getConfig(), id)
      set({
        lastResult: result,
        currentRun: result.run ?? get().currentRun,
        execStatus: result.ok ? 'cancelled' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Cancel failed'),
      })
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) })
    }
  },

  unschedule: async (id) => {
    set({ execStatus: 'running', lastError: null })
    try {
      const result = await lobsterUnschedule(getConfig(), id)
      set({
        lastResult: result,
        execStatus: result.ok ? 'success' : 'error',
        lastError: result.ok ? null : (result.error?.message ?? 'Unknown error'),
      })
      await get().list()
      return result
    } catch (err) {
      set({
        execStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  },

  setScheduleEnabled: async (id, enabled) => {
    set({ execStatus: 'running', lastError: null })
    try {
      const result = await lobsterSetScheduleEnabled(getConfig(), id, enabled)
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

  reset: () => {
    set({ execStatus: 'idle', lastResult: null, lastError: null, currentRun: null, pendingResumeGatewayConfig: null })
  },
}))
