import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGatewayStore, resolveGatewayOptions } from '../store/gateway-store'
import { loadConfig, saveConfig } from '../lib/gateway-client'
import type { GatewayConfig } from '../lib/gateway-client'

const mockConfig: GatewayConfig = { url: 'http://localhost:18789', token: 'test-token' }

const mockDiscovery = {
  agents: [
    { id: 'soren', name: 'Soren' },
    { id: 'atlas', name: 'Atlas', default: true },
  ],
  models: [
    { id: 'claude-sonnet-4-5', alias: 'sonnet', provider: 'anthropic' },
  ],
  channels: [
    { id: 'discord', enabled: true, type: 'discord' },
    { id: 'telegram', enabled: false, type: 'telegram' },
  ],
  skills: [
    { id: 'weather', name: 'weather', description: 'Get weather' },
  ],
  tools: ['exec', 'read'],
  nodes: [
    { id: 'oc-node-1', name: 'MacBook', connected: true },
  ],
}

function mockFetchWithDiscovery() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
      // Phase 2: return 404 to trigger Phase 1 fallback
      if ((url as string).includes('/api/discover')) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
      }
      // Phase 1 tool invocations
      const body = JSON.parse(opts?.body ?? '{}')
      if (body.tool === 'agents_list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: { agents: mockDiscovery.agents } }),
        })
      }
      if (body.tool === 'tools.catalog') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              result: {
                groups: [
                  {
                    id: 'core',
                    tools: mockDiscovery.tools.map((id) => ({ id })),
                  },
                ],
              },
            }),
        })
      }
      if (body.tool === 'channels.status') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              result: {
                channelOrder: mockDiscovery.channels.map((channel) => channel.id),
                channels: Object.fromEntries(
                  mockDiscovery.channels.map((channel) => [
                    channel.id,
                    { enabled: channel.enabled, type: channel.type },
                  ]),
                ),
              },
            }),
        })
      }
      if (body.tool === 'node.list') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              result: {
                nodes: mockDiscovery.nodes.map((node) => ({
                  nodeId: node.id,
                  displayName: node.name,
                  connected: node.connected,
                })),
              },
            }),
        })
      }
      // session_status — return a model
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: {
              model: mockDiscovery.models[0].id,
              model_alias: mockDiscovery.models[0].alias,
            },
          }),
      })
    }),
  )
}

function mockGatewayRpcWithDiscovery() {
  class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    readyState = MockWebSocket.OPEN
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null

    constructor() {
      setTimeout(() => {
        this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-1' } })
      }, 0)
    }

    send(raw: string) {
      const frame = JSON.parse(raw) as Record<string, unknown>
      if (frame.method === 'connect') {
        setTimeout(() => {
          this.emit({
            type: 'res',
            id: frame.id,
            ok: true,
            payload: {
              type: 'hello-ok',
              protocol: 4,
              server: { version: 'test', connId: 'conn-1' },
              features: { methods: ['tools.invoke'], events: [] },
              snapshot: {},
              auth: { role: 'operator', scopes: ['operator.read', 'operator.write'] },
              policy: { maxPayload: 1, maxBufferedBytes: 1, tickIntervalMs: 1000 },
            },
          })
        }, 0)
        return
      }
      const output = frame.method === 'agents.list'
        ? {
            defaultId: 'atlas',
            mainKey: 'main',
            scope: 'per-sender',
            agents: mockDiscovery.agents,
          }
        : frame.method === 'tools.catalog'
          ? { groups: [{ id: 'core', tools: mockDiscovery.tools.map((id) => ({ id })) }] }
          : frame.method === 'channels.status'
            ? {
                channelOrder: mockDiscovery.channels.map((channel) => channel.id),
                channels: Object.fromEntries(
                  mockDiscovery.channels.map((channel) => [
                    channel.id,
                    { enabled: channel.enabled, type: channel.type },
                  ]),
                ),
              }
            : frame.method === 'node.list'
              ? {
                  nodes: mockDiscovery.nodes.map((node) => ({
                    nodeId: node.id,
                    displayName: node.name,
                    connected: node.connected,
                  })),
                }
              : {
                agentId: 'atlas',
                groups: [{ id: 'core', tools: mockDiscovery.tools.map((id) => ({ id })) }],
              }
      setTimeout(() => {
        this.emit({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: output,
        })
      }, 0)
    }

    close() {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.()
    }

    private emit(frame: Record<string, unknown>) {
      this.onmessage?.({ data: JSON.stringify(frame) })
    }
  }

  vi.stubGlobal('WebSocket', MockWebSocket)
}

function resetStore() {
  useGatewayStore.setState({
    config: null,
    gateways: [],
    selectedGatewayId: null,
    status: 'disconnected',
    discovery: null,
    lastError: null,
    lastRefresh: null,
  })
}

async function waitForGatewayStatus(status: string) {
  const deadline = Date.now() + 500
  while (useGatewayStore.getState().status !== status && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

beforeEach(() => {
  resetStore()
  localStorage.clear()
  vi.stubGlobal('fetch', undefined)
  delete window.__LOBSTER_BUILDER_GATEWAY__
})

afterEach(() => {
  delete window.__LOBSTER_BUILDER_GATEWAY__
  vi.unstubAllGlobals()
})

describe('init()', () => {
  it('stays disconnected when no config is saved', () => {
    useGatewayStore.getState().init()
    expect(useGatewayStore.getState().status).toBe('disconnected')
  })

  it('connects when saved config exists', async () => {
    mockFetchWithDiscovery()
    saveConfig(mockConfig)

    useGatewayStore.getState().init()
    await waitForGatewayStatus('connected')

    expect(useGatewayStore.getState().status).toBe('connected')
  })

  it('prefers non-persistent hosted same-origin config over saved config', async () => {
    mockFetchWithDiscovery()
    mockGatewayRpcWithDiscovery()
    saveConfig(mockConfig)
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      id: 'openclaw-hosted',
      name: 'Hosting OpenClaw gateway',
      url: '',
      token: '',
      persist: false,
    }

    useGatewayStore.getState().init()
    await waitForGatewayStatus('connected')

    const state = useGatewayStore.getState()
    expect(state.status).toBe('connected')
    expect(state.config).toEqual({
      id: 'openclaw-hosted',
      name: 'Hosting OpenClaw gateway',
      url: '',
      token: '',
    })
    expect(state.selectedGatewayId).toBe('openclaw-hosted')
    expect(loadConfig()).toEqual(mockConfig)
  })
})

describe('connect()', () => {
  it('happy path: sets status=connected and populates discovery', async () => {
    mockFetchWithDiscovery()

    await useGatewayStore.getState().connect(mockConfig)

    const state = useGatewayStore.getState()
    expect(state.status).toBe('connected')
    expect(state.discovery).not.toBeNull()
    expect(state.discovery!.agents).toHaveLength(2)
    expect(state.lastRefresh).toBeTypeOf('number')
    expect(state.lastError).toBeNull()
  })

  it('failure: sets status=error and stores error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

    await useGatewayStore.getState().connect(mockConfig)

    const state = useGatewayStore.getState()
    expect(state.status).toBe('error')
    expect(state.lastError).toContain('Connection refused')
    expect(state.discovery).toBeNull()
  })
})

describe('disconnect()', () => {
  it('clears state and localStorage', async () => {
    mockFetchWithDiscovery()
    await useGatewayStore.getState().connect(mockConfig)
    expect(useGatewayStore.getState().status).toBe('connected')

    useGatewayStore.getState().disconnect()

    const state = useGatewayStore.getState()
    expect(state.status).toBe('disconnected')
    expect(state.config).toBeNull()
    expect(state.discovery).toBeNull()

    // Config should be removed from localStorage
    expect(localStorage.getItem('lobster-gateway')).toBeNull()
  })
})

describe('resolveGatewayOptions()', () => {
  it('returns mapped agent options when connected', async () => {
    mockFetchWithDiscovery()
    await useGatewayStore.getState().connect(mockConfig)

    const { status, discovery } = useGatewayStore.getState()
    const options = resolveGatewayOptions('agents', discovery, status)
    expect(options).not.toBeNull()
    expect(options).toHaveLength(2)
    expect(options![0]).toEqual({ label: 'Soren', value: 'soren' })
    expect(options![1]).toEqual({ label: 'Atlas', value: 'atlas' })
  })

  it('returns null when disconnected', () => {
    const options = resolveGatewayOptions('agents', null, 'disconnected')
    expect(options).toBeNull()
  })

  it('returns null for null source', () => {
    expect(resolveGatewayOptions(null, mockDiscovery, 'connected')).toBeNull()
  })

  it('filters disabled channels', () => {
    const options = resolveGatewayOptions('channels', mockDiscovery, 'connected')
    // Only enabled channels (discord is enabled, telegram is disabled)
    expect(options).toHaveLength(1)
    expect(options![0].value).toBe('discord')
  })

  it('maps models with alias as value', () => {
    const options = resolveGatewayOptions('models', mockDiscovery, 'connected')
    expect(options).toHaveLength(1)
    expect(options![0]).toEqual({ label: 'sonnet', value: 'sonnet' })
  })

  it('maps paired nodes by display label with node id as value', () => {
    const options = resolveGatewayOptions('nodes', mockDiscovery, 'connected')
    expect(options).toEqual([{ label: 'MacBook', value: 'oc-node-1' }])
  })
})
