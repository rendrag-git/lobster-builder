import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import type { GatewayConfig } from '../lib/gateway-client'

const activeGateway: GatewayConfig = {
  id: 'active',
  name: 'Active',
  url: 'http://active-gateway',
  token: 'active-token',
}

const workflowGateway: GatewayConfig = {
  id: 'workflow',
  name: 'Workflow',
  url: 'http://workflow-gateway',
  token: 'workflow-token',
}

function resetStores() {
  useGatewayStore.setState({
    config: activeGateway,
    gateways: [
      { ...activeGateway, id: 'active', name: 'Active' },
      { ...workflowGateway, id: 'workflow', name: 'Workflow' },
    ],
    selectedGatewayId: 'active',
    status: 'connected',
    discovery: null,
    lastError: null,
    lastRefresh: null,
  })
  useLobsterStore.setState({
    execStatus: 'idle',
    lastResult: null,
    lastError: null,
    currentRun: null,
    publishedWorkflows: [],
    publishedWorkflowsGatewayKey: null,
    publishedWorkflowsStatus: 'idle',
    publishedWorkflowsError: null,
    haltedWorkflows: [],
    pendingResumeGatewayConfig: null,
  })
}

function stubGatewayRpc(handler: (method: string, params: Record<string, unknown>) => unknown) {
  const sentFrames: Array<Record<string, unknown>> = []

  class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    readyState = MockWebSocket.OPEN
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    url: string

    constructor(url: string) {
      this.url = url
      setTimeout(() => {
        this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-1' } })
      }, 0)
    }

    send(raw: string) {
      const frame = JSON.parse(raw) as Record<string, unknown>
      sentFrames.push({ ...frame, url: this.url })
      if (frame.method === 'connect') {
        const connectParams = frame.params as { scopes?: string[] }
        setTimeout(() => {
          this.emit({
            type: 'res',
            id: frame.id,
            ok: true,
            payload: {
              type: 'hello-ok',
              protocol: 4,
              server: { version: 'test', connId: 'conn-1' },
              features: { methods: [], events: [] },
              snapshot: {},
              auth: { role: 'operator', scopes: connectParams.scopes ?? [] },
              policy: { maxPayload: 1, maxBufferedBytes: 1, tickIntervalMs: 1000 },
            },
          })
        }, 0)
        return
      }

      setTimeout(() => {
        this.emit({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: handler(String(frame.method), (frame.params ?? {}) as Record<string, unknown>),
        })
      }, 0)
    }

    close() {
      this.readyState = MockWebSocket.CLOSED
    }

    private emit(frame: Record<string, unknown>) {
      this.onmessage?.({ data: JSON.stringify(frame) })
    }
  }

  vi.stubGlobal('WebSocket', MockWebSocket)
  return sentFrames
}

beforeEach(() => {
  resetStores()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLobsterStore', () => {
  it('resumes approval runs through the gateway used for the original workflow run', async () => {
    const requestUrls: string[] = []
    const requestBodies: Array<{ args: { action: string } }> = []

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts: { body: string }) => {
        requestUrls.push(url)
        const body = JSON.parse(opts.body) as { args: { action: string } }
        requestBodies.push(body)
        const result = body.args.action === 'run'
          ? {
              ok: true,
              status: 'needs_approval',
              output: [],
              requiresApproval: {
                type: 'approval_request',
                prompt: 'Approve?',
                items: [],
                resumeToken: 'resume-token',
              },
            }
          : {
              ok: true,
              status: 'ok',
              output: [{ done: true }],
              requiresApproval: null,
            }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result }),
        })
      }),
    )

    await useLobsterStore.getState().run('name: test\nsteps:\n  - id: a\n    run: echo ok\n', {
      gatewayConfig: workflowGateway,
    })
    expect(useLobsterStore.getState().execStatus).toBe('approval')

    await useLobsterStore.getState().resume({ token: 'resume-token' }, true)

    expect(requestBodies.map((body) => body.args.action)).toEqual(['run', 'resume'])
    expect(requestUrls).toEqual([
      'http://workflow-gateway/tools/invoke',
      'http://workflow-gateway/tools/invoke',
    ])
  })

  it('keeps approval state when resume pauses for another approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body) as { args: { action: string } }
        const result = body.args.action === 'run'
          ? {
              ok: true,
              status: 'needs_approval',
              output: [],
              requiresApproval: {
                type: 'approval_request',
                prompt: 'First approval?',
                items: [],
                resumeToken: 'first-token',
              },
            }
          : {
              ok: true,
              status: 'needs_approval',
              output: [],
              requiresApproval: {
                type: 'approval_request',
                prompt: 'Second approval?',
                items: [],
                resumeToken: 'second-token',
              },
            }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result }),
        })
      }),
    )

    await useLobsterStore.getState().run('name: test\nsteps:\n  - id: a\n    run: echo ok\n', {
      gatewayConfig: workflowGateway,
    })
    await useLobsterStore.getState().resume({ token: 'first-token' }, true)

    expect(useLobsterStore.getState().execStatus).toBe('approval')
    expect(useLobsterStore.getState().lastResult?.requiresApproval?.prompt).toBe('Second approval?')
  })

  it('uses explicit gateway configs for run status, cancel, and schedule controls', async () => {
    const methods: string[] = []
    const frames = stubGatewayRpc((method) => {
      methods.push(method)
      if (method === 'tasks.flows.get' || method === 'tasks.flows.cancel') {
        return { flow: { id: 'flow-1', status: method === 'tasks.flows.cancel' ? 'cancelled' : 'succeeded' } }
      }
      if (method === 'lobster.workflow.list') return { workflows: [] }
      return { ok: true, id: 'cron-1' }
    })

    await useLobsterStore.getState().status('flow-1', { gatewayConfig: workflowGateway })
    await useLobsterStore.getState().cancel('flow-1', { gatewayConfig: workflowGateway })
    await useLobsterStore.getState().setScheduleEnabled('cron-1', false, { gatewayConfig: workflowGateway })
    await useLobsterStore.getState().unschedule('cron-1', { gatewayConfig: workflowGateway })

    expect(methods).toEqual([
      'tasks.flows.get',
      'tasks.flows.cancel',
      'cron.update',
      'cron.remove',
      'lobster.workflow.list',
    ])
    const requestUrls = frames
      .filter((frame) => frame.method !== 'connect')
      .map((frame) => String(frame.url))
    expect(requestUrls).toEqual([
      'ws://workflow-gateway/ws',
      'ws://workflow-gateway/ws',
      'ws://workflow-gateway/ws',
      'ws://workflow-gateway/ws',
      'ws://workflow-gateway/ws',
    ])
  })

  it('maps refreshed in-flight run status back to running instead of preserving stale approval state', async () => {
    stubGatewayRpc((method) => {
      if (method === 'tasks.flows.get') {
        return { flow: { id: 'flow-1', status: 'running' } }
      }
      return {}
    })
    useLobsterStore.setState({
      execStatus: 'approval',
      lastError: 'Waiting for approval',
      currentRun: { flowId: 'flow-1', status: 'waiting' },
    })

    await useLobsterStore.getState().status('flow-1', { gatewayConfig: workflowGateway })

    expect(useLobsterStore.getState().execStatus).toBe('running')
    expect(useLobsterStore.getState().lastError).toBeNull()
    expect(useLobsterStore.getState().currentRun?.status).toBe('running')
  })
})
