import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  lobsterInvoke,
  lobsterRun,
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
import type { GatewayConfig } from '../lib/gateway-client'

const mockConfig: GatewayConfig = { url: 'http://localhost:18789', token: 'test-token' }
const okEnvelope = { ok: true, status: 'ok', output: [{ hello: 'world' }], requiresApproval: null }

function stubFetch(handler: (body: Record<string, unknown>) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body)
      const result = handler(body)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result }),
      })
    }),
  )
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

    constructor() {
      setTimeout(() => {
        this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-1' } })
      }, 0)
    }

    send(raw: string) {
      const frame = JSON.parse(raw) as Record<string, unknown>
      sentFrames.push(frame)
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

function requestScopesFor(frames: Array<Record<string, unknown>>, method: string): string[] {
  const requestIndex = frames.findIndex((frame) => frame.method === method)
  expect(requestIndex).toBeGreaterThan(0)
  const connectFrame = frames
    .slice(0, requestIndex)
    .reverse()
    .find((frame) => frame.method === 'connect')
  const connectParams = connectFrame?.params as { scopes?: unknown } | undefined
  return Array.isArray(connectParams?.scopes)
    ? connectParams.scopes.filter((scope): scope is string => typeof scope === 'string')
    : []
}

beforeEach(() => {
  vi.stubGlobal('fetch', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lobsterInvoke() routing', () => {
  it('routes run to tool "lobster"', async () => {
    let capturedTool = ''
    stubFetch((body) => {
      capturedTool = body.tool as string
      return okEnvelope
    })

    await lobsterInvoke(mockConfig, 'run', { pipeline: 'test' })
    expect(capturedTool).toBe('lobster')
  })

  it('routes resume to tool "lobster"', async () => {
    let capturedTool = ''
    stubFetch((body) => {
      capturedTool = body.tool as string
      return okEnvelope
    })

    await lobsterInvoke(mockConfig, 'resume', { token: 'tok', approve: true })
    expect(capturedTool).toBe('lobster')
  })

  it('routes publish/list to native Lobster workflow gateway methods', async () => {
    const frames = stubGatewayRpc((method) => {
      if (method === 'lobster.workflow.list') return { ok: true, workflows: [] }
      return { ok: true, workflow: { workflowId: 'wf-42' } }
    })

    await lobsterInvoke(mockConfig, 'publish', { workflowYaml: 'steps: []', workflowId: 'wf-42' })
    await lobsterInvoke(mockConfig, 'list')

    expect(frames.filter((frame) => frame.method !== 'connect').map((frame) => frame.method)).toEqual([
      'lobster.workflow.publish',
      'lobster.workflow.list',
    ])
  })
})

describe('lobsterInvoke() args forwarding', () => {
  it('passes action and extra args in the tool request body', async () => {
    let capturedArgs: Record<string, unknown> = {}
    stubFetch((body) => {
      capturedArgs = body.args as Record<string, unknown>
      return okEnvelope
    })

    await lobsterInvoke(mockConfig, 'run', { pipeline: 'my-pipe', argsJson: '{"k":1}' })
    expect(capturedArgs).toMatchObject({
      action: 'run',
      pipeline: 'my-pipe',
      argsJson: '{"k":1}',
    })
  })
})

describe('convenience functions', () => {
  it('lobsterRun sends pipeline and opts', async () => {
    let capturedArgs: Record<string, unknown> = {}
    stubFetch((body) => {
      capturedArgs = body.args as Record<string, unknown>
      return okEnvelope
    })

    await lobsterRun(mockConfig, 'email-triage', { argsJson: '{}' })
    expect(capturedArgs.action).toBe('run')
    expect(capturedArgs.pipeline).toBe('email-triage')
    expect(capturedArgs.argsJson).toBe('{}')
  })

  it('lobsterRunWorkflow sends inline workflow YAML through the lobster tool', async () => {
    let capturedArgs: Record<string, unknown> = {}
    stubFetch((body) => {
      capturedArgs = body.args as Record<string, unknown>
      return okEnvelope
    })

    await lobsterRunWorkflow(mockConfig, 'name: test\nsteps:\n  - id: s\n    run: echo ok\n', { argsJson: '{}', name: 'Test' })
    expect(capturedArgs.action).toBe('run')
    expect(capturedArgs.workflowYaml).toContain('name: test')
    expect(capturedArgs.pipeline).toBeUndefined()
    expect(capturedArgs.argsJson).toBe('{}')
    expect(capturedArgs.flowControllerId).toBe('lobster-builder/test-run')
    expect(capturedArgs.flowGoal).toBe('Run Lobster workflow: Test')
    expect(capturedArgs.flowCurrentStep).toBe('run_lobster')
    expect(capturedArgs.flowWaitingStep).toBe('await_lobster_approval')
  })

  it('lobsterRunWorkflow extracts managed TaskFlow run handles from lobster output', async () => {
    stubFetch(() => ({
      content: [],
      details: {
        envelope: { ok: true, status: 'needs_approval', output: [], requiresApproval: { prompt: 'Approve?', items: [], type: 'approval_request', resumeToken: 'tok' } },
        flow: { flowId: 'flow-1', revision: 1, status: 'running' },
        mutation: { applied: true, flow: { flowId: 'flow-1', revision: 2, status: 'waiting', currentStep: 'await_lobster_approval' } },
      },
    }))

    const result = await lobsterRunWorkflow(mockConfig, 'name: test\nsteps: []\n')

    expect(result).toMatchObject({
      ok: true,
      status: 'needs_approval',
      run: {
        flowId: 'flow-1',
        revision: 2,
        status: 'waiting',
        currentStep: 'await_lobster_approval',
      },
      requiresApproval: {
        resumeToken: 'tok',
      },
    })
  })

  it('lobsterPublishWorkflow sends workflow YAML to lobster.workflow.publish', async () => {
    const frames = stubGatewayRpc((_method, params) => ({
      ok: true,
      workflow: { workflowId: params.workflowId, name: params.name },
    }))

    const result = await lobsterPublishWorkflow(mockConfig, 'name: test\nsteps:\n  - id: s\n    run: echo ok\n', {
      id: 'test-flow',
      name: 'Test Flow',
      metadata: {
        bundle: { id: 'test-flow', mode: 'chain', workflowRefs: ['child-flow@2'] },
      },
    })
    const publish = frames.find((frame) => frame.method === 'lobster.workflow.publish')
    expect(publish?.params).toMatchObject({
      workflowYaml: expect.stringContaining('name: test'),
      workflowId: 'test-flow',
      id: 'test-flow',
      name: 'Test Flow',
      metadata: {
        bundle: { id: 'test-flow', mode: 'chain', workflowRefs: ['child-flow@2'] },
      },
    })
    expect(result).toMatchObject({
      ok: true,
      status: 'published',
      output: [{ workflowId: 'test-flow', name: 'Test Flow' }],
    })
  })

  it('lobsterPublishWorkflow installs schedules through cron.add and stores the returned job id', async () => {
    const frames = stubGatewayRpc((method, params) => {
      if (method === 'cron.add') {
        return {
          id: 'cron-test-flow',
          name: params.name,
          enabled: true,
          schedule: params.schedule,
          sessionTarget: params.sessionTarget,
          wakeMode: params.wakeMode,
          payload: params.payload,
          delivery: params.delivery,
          createdAtMs: 1,
          updatedAtMs: 1,
          state: {},
        }
      }
      return {
        ok: true,
        workflow: { workflowId: params.workflowId, name: params.name, revision: 3 },
      }
    })

    const result = await lobsterPublishWorkflow(mockConfig, 'name: test\nsteps: []\n', {
      id: 'test-flow',
      name: 'Test Flow',
      schedule: {
        enabled: true,
        cron: '0 9 * * 1-5',
        timezone: 'UTC',
        sessionKey: 'agent:main:main',
        agentId: 'main',
        toolsAllow: ['message', 'lobster'],
      },
    })

    const publish = frames.find((frame) => frame.method === 'lobster.workflow.publish')
    expect(publish?.params).toMatchObject({
      workflowYaml: expect.stringContaining('name: test'),
      workflowId: 'test-flow',
      name: 'Test Flow',
    })
    expect(publish?.params).not.toHaveProperty('schedule')
    expect(publish?.params).not.toHaveProperty('sessionKey')

    expect(frames.find((frame) => frame.method === 'cron.add')?.params).toMatchObject({
      name: 'lobster:test-flow',
      enabled: true,
      schedule: { kind: 'cron', expr: '0 9 * * 1-5', tz: 'UTC' },
      sessionTarget: 'isolated',
      agentId: 'main',
      sessionKey: 'agent:main:main',
      wakeMode: 'now',
      payload: {
        kind: 'agentTurn',
        message: expect.stringContaining('"workflowId":"test-flow"'),
        toolsAllow: ['lobster', 'message'],
      },
      delivery: { mode: 'none' },
    })
    expect(requestScopesFor(frames, 'cron.add')).toEqual(['operator.admin'])
    expect(result.output).toEqual([
      expect.objectContaining({
        workflowId: 'test-flow',
        revision: 3,
        schedule: expect.objectContaining({
          jobId: 'cron-test-flow',
          workflowId: 'test-flow',
          revision: 3,
          cron: '0 9 * * 1-5',
          timezone: 'UTC',
        }),
      }),
    ])
  })

  it('lobsterPublishWorkflow installs lobster-only cron jobs for workflows without native action tools', async () => {
    const frames = stubGatewayRpc((method, params) => {
      if (method === 'cron.add') {
        return { id: 'cron-basic-flow' }
      }
      return { ok: true, workflow: { workflowId: params.workflowId, revision: 1 } }
    })

    await lobsterPublishWorkflow(mockConfig, 'name: test\nsteps: []\n', {
      id: 'basic-flow',
      schedule: {
        enabled: true,
        cron: '0 9 * * *',
        sessionKey: 'agent:main:main',
      },
    })

    expect(frames.find((frame) => frame.method === 'cron.add')?.params).toMatchObject({
      payload: { toolsAllow: ['lobster'] },
    })
    expect(requestScopesFor(frames, 'cron.add')).toEqual(['operator.admin'])
  })

  it('lobsterPublishWorkflow updates an existing cron job when schedule jobId is present', async () => {
    const frames = stubGatewayRpc((method, params) => {
      if (method === 'cron.update') {
        return { id: params.id, ...(params.patch as Record<string, unknown>) }
      }
      return { ok: true, workflow: { workflowId: params.workflowId, revision: 2 } }
    })

    const result = await lobsterPublishWorkflow(mockConfig, 'name: test\nsteps: []\n', {
      id: 'existing-flow',
      schedule: {
        enabled: true,
        jobId: 'cron-existing-flow',
        cron: '15 10 * * 1-5',
        timezone: 'America/New_York',
        sessionKey: 'agent:main:main',
      },
    })

    expect(frames.find((frame) => frame.method === 'cron.add')).toBeUndefined()
    expect(frames.find((frame) => frame.method === 'cron.update')?.params).toMatchObject({
      id: 'cron-existing-flow',
      patch: {
        name: 'lobster:existing-flow',
        enabled: true,
        schedule: { kind: 'cron', expr: '15 10 * * 1-5', tz: 'America/New_York' },
        sessionTarget: 'isolated',
        sessionKey: 'agent:main:main',
        wakeMode: 'now',
        payload: {
          kind: 'agentTurn',
          message: expect.stringContaining('"workflowRevision":2'),
          toolsAllow: ['lobster'],
        },
        delivery: { mode: 'none' },
      },
    })
    expect(requestScopesFor(frames, 'cron.update')).toEqual(['operator.admin'])
    expect(result.output?.[0]).toMatchObject({
      workflowId: 'existing-flow',
      schedule: { jobId: 'cron-existing-flow' },
    })
  })

  it('lobsterResume sends token and approve', async () => {
    let capturedArgs: Record<string, unknown> = {}
    stubFetch((body) => {
      capturedArgs = body.args as Record<string, unknown>
      return okEnvelope
    })

    await lobsterResume(mockConfig, { token: 'resume-tok' }, false)
    expect(capturedArgs.action).toBe('resume')
    expect(capturedArgs.token).toBe('resume-tok')
    expect(capturedArgs.approve).toBe(false)
  })

  it('lobsterResume can send approvalId without token', async () => {
    let capturedArgs: Record<string, unknown> = {}
    stubFetch((body) => {
      capturedArgs = body.args as Record<string, unknown>
      return okEnvelope
    })

    await lobsterResume(mockConfig, { approvalId: 'approval-1' }, true)
    expect(capturedArgs.action).toBe('resume')
    expect(capturedArgs.token).toBeUndefined()
    expect(capturedArgs.approvalId).toBe('approval-1')
    expect(capturedArgs.approve).toBe(true)
  })

  it('lobsterList reads lobster.workflow.list results', async () => {
    stubGatewayRpc(() => ({
      ok: true,
      workflows: [{
        workflowId: 'wf-42',
        name: 'Workflow 42',
        revision: 3,
        status: 'published',
        metadata: {
          openclaw: {
            bundle: {
              mode: 'library',
              reusable: true,
              workflowRefs: ['child@1'],
            },
          },
        },
      }],
    }))

    const result = await lobsterList(mockConfig)
    expect(result).toMatchObject({
      ok: true,
      output: [{ workflowId: 'wf-42', status: 'published' }],
    })
    expect(normalizePublishedWorkflowList(result)).toEqual([
      {
        workflowId: 'wf-42',
        name: 'Workflow 42',
        revision: 3,
        status: 'published',
        bundleMode: 'library',
        reusable: true,
        workflowRefs: ['child@1'],
      },
    ])
  })

  it('lobsterStatus reads tasks.flows.get by flow id', async () => {
    const frames = stubGatewayRpc((_method, params) => ({
      flow: { id: params.flowId, status: 'waiting', currentStep: 'await_lobster_approval' },
    }))

    const result = await lobsterStatus(mockConfig, 'flow-42')
    expect(frames.find((frame) => frame.method === 'tasks.flows.get')?.params).toEqual({
      flowId: 'flow-42',
    })
    expect(result.run).toMatchObject({ flowId: 'flow-42', status: 'waiting' })
  })

  it('lobsterCancel cancels managed TaskFlow runs by flow id', async () => {
    const frames = stubGatewayRpc((_method, params) => ({
      found: true,
      cancelled: true,
      flow: { id: params.flowId, status: 'cancelled' },
    }))

    const result = await lobsterCancel(mockConfig, 'flow-42')
    expect(frames.find((frame) => frame.method === 'tasks.flows.cancel')?.params).toEqual({
      flowId: 'flow-42',
    })
    expect(result.status).toBe('cancelled')
    expect(result.run).toMatchObject({ flowId: 'flow-42', status: 'cancelled' })
  })

  it('lobsterUnschedule removes cron jobs by returned job id', async () => {
    const frames = stubGatewayRpc((_method, params) => ({
      ok: true,
      id: params.id,
      removed: true,
    }))

    const result = await lobsterUnschedule(mockConfig, 'cron-wf-42')

    expect(frames.find((frame) => frame.method === 'cron.remove')?.params).toEqual({
      id: 'cron-wf-42',
    })
    expect(requestScopesFor(frames, 'cron.remove')).toEqual(['operator.admin'])
    expect(result).toMatchObject({
      ok: true,
      status: 'unscheduled',
      output: [{ ok: true, id: 'cron-wf-42', removed: true }],
    })
  })

  it('lobsterSetScheduleEnabled pauses and resumes cron jobs through cron.update', async () => {
    const frames = stubGatewayRpc((_method, params) => ({
      id: params.id,
      enabled: (params.patch as Record<string, unknown>).enabled,
    }))

    const pause = await lobsterSetScheduleEnabled(mockConfig, 'cron-wf-42', false)
    const resume = await lobsterSetScheduleEnabled(mockConfig, 'cron-wf-42', true)

    expect(frames.filter((frame) => frame.method === 'cron.update').map((frame) => frame.params)).toEqual([
      { id: 'cron-wf-42', patch: { enabled: false } },
      { id: 'cron-wf-42', patch: { enabled: true } },
    ])
    expect(requestScopesFor(frames, 'cron.update')).toEqual(['operator.admin'])
    expect(pause.status).toBe('schedule-paused')
    expect(resume.status).toBe('schedule-resumed')
  })
})
