import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGatewayStore, resolveGatewayOptions } from '../store/gateway-store'
import { saveConfig } from '../lib/gateway-client'
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
}

function mockFetchWithDiscovery() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body)
      if (body.tool === 'agents_list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: { agents: mockDiscovery.agents } }),
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

function resetStore() {
  useGatewayStore.setState({
    config: null,
    status: 'disconnected',
    discovery: null,
    lastError: null,
    lastRefresh: null,
  })
}

beforeEach(() => {
  resetStore()
  localStorage.clear()
  vi.stubGlobal('fetch', undefined)
})

afterEach(() => {
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
    // Allow promises to settle
    await new Promise((r) => setTimeout(r, 10))

    expect(useGatewayStore.getState().status).toBe('connected')
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
})
