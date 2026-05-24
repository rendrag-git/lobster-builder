import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('openclaw/plugin-sdk/plugin-entry', () => ({
  definePluginEntry: (definition) => definition,
}))

vi.mock('openclaw/plugin-sdk/temp-path', () => ({
  resolvePreferredOpenClawTmpDir: () => '/tmp',
}))

vi.mock('openclaw/plugin-sdk/gateway-runtime', () => ({
  ErrorCodes: {
    INVALID_REQUEST: 'invalid_request',
  },
  errorShape: (code, message) => ({ code, message }),
}))

const plugin = await import('./index.mjs')

function createPluginApi() {
  return {
    runtime: {
      state: {
        resolveStateDir: () => '/tmp/lobster-builder-state',
        registry: {
          namespace: () => ({
            lookup: vi.fn(),
            register: vi.fn(),
            delete: vi.fn(),
            list: vi.fn(() => []),
          }),
        },
      },
      tasks: {
        managedFlows: {
          fromToolContext: vi.fn(),
        },
      },
    },
    registerGatewayMethod: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerTool: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OpenClaw Lobster Builder plugin entry', () => {
  it('registers the hosted UI and gateway-local Lobster runtime surfaces', () => {
    const api = createPluginApi()

    plugin.default.register(api)

    expect(api.registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/plugins/lobster-builder',
        auth: 'plugin',
        match: 'prefix',
        handler: expect.any(Function),
      }),
    )
    expect(api.registerGatewayMethod.mock.calls.map(([method, _handler, opts]) => [method, opts]))
      .toEqual([
        ['lobster.workflow.publish', { scope: 'operator.write' }],
        ['lobster.workflow.list', { scope: 'operator.read' }],
        ['lobster.workflow.get', { scope: 'operator.read' }],
        ['lobster.workflow.delete', { scope: 'operator.write' }],
      ])
    expect(api.registerTool).toHaveBeenCalledWith(expect.any(Function), { optional: true })
  })
})
