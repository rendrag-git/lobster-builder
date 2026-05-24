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
    publishedWorkflowsStatus: 'idle',
    publishedWorkflowsError: null,
    haltedWorkflows: [],
    pendingResumeGatewayConfig: null,
  })
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
})
