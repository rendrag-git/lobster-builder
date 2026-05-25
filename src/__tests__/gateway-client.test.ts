import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { discover, testConnection, loadConfig, loadHostedGatewayConfig, saveConfig, clearConfig, loadGateways, saveGateway, deleteGateway, callGatewayRpc } from '../lib/gateway-client'
import type { GatewayConfig } from '../lib/gateway-client'

const mockConfig: GatewayConfig = { url: 'http://localhost:18789', token: 'test-token' }

function mockFetchHttpError(status: number, statusText: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  })
}

function mockGatewayRpc(effectiveResult: unknown) {
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
      sentFrames.push(frame)
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
              features: { methods: ['tools.effective'], events: [] },
              snapshot: {},
              auth: { role: 'operator', scopes: ['operator.read'] },
              policy: { maxPayload: 1, maxBufferedBytes: 1, tickIntervalMs: 1000 },
            },
          })
        }, 0)
        return
      }
      if (frame.method === 'tools.effective') {
        setTimeout(() => {
          this.emit({ type: 'res', id: frame.id, ok: true, payload: effectiveResult })
        }, 0)
      }
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

function mockHostedGatewayRpc(results: {
  agents?: unknown
  sessionStatus?: unknown
  tools?: unknown
  channels?: unknown
  nodes?: unknown
  effective?: unknown
}) {
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
              auth: { role: 'operator', scopes: ['operator.read'] },
              policy: { maxPayload: 1, maxBufferedBytes: 1, tickIntervalMs: 1000 },
            },
          })
        }, 0)
        return
      }

      const payload = frame.method === 'agents.list'
        ? results.agents
        : frame.method === 'tools.invoke'
          ? { ok: true, output: results.sessionStatus ?? {} }
          : frame.method === 'tools.catalog'
            ? results.tools
            : frame.method === 'channels.status'
              ? results.channels
              : frame.method === 'node.list'
                ? results.nodes
                : results.effective
      setTimeout(() => {
        this.emit({ type: 'res', id: frame.id, ok: true, payload })
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
  vi.stubGlobal('fetch', undefined)
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  delete window.__LOBSTER_BUILDER_GATEWAY__
})

afterEach(() => {
  delete window.__LOBSTER_BUILDER_GATEWAY__
  vi.unstubAllGlobals()
})

describe('discover()', () => {
  it('preserves gateway WebSocket close reasons for auth failures', async () => {
    class ClosingWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 3

      readyState = ClosingWebSocket.OPEN
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: ((event: { reason: string }) => void) | null = null

      constructor() {
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-1' } }),
          })
        }, 0)
      }

      send(raw: string) {
        const frame = JSON.parse(raw) as Record<string, unknown>
        if (frame.method === 'connect') {
          setTimeout(() => {
            this.readyState = ClosingWebSocket.CLOSED
            this.onclose?.({ reason: 'unauthorized: gateway token missing' })
          }, 0)
        }
      }

      close() {
        this.readyState = ClosingWebSocket.CLOSED
      }
    }

    vi.stubGlobal('WebSocket', ClosingWebSocket)

    await expect(callGatewayRpc({ url: '', token: '' }, 'tools.catalog')).rejects.toThrow(
      /gateway token missing/,
    )
  })

  it('maps agents_list and session_status results into DiscoveryData (Phase 1 fallback)', async () => {
    const agentsResult = {
      agents: [
        { id: 'soren', name: 'Soren' },
        { id: 'atlas', name: 'Atlas', default: true },
      ],
    }
    const statusResult = {
      model: 'claude-sonnet-4-5',
      model_alias: 'sonnet',
    }
    const toolsResult = {
      groups: [
        {
          id: 'messaging',
          tools: [{ id: 'message' }, { id: 'lobster' }],
        },
      ],
    }
    const channelsResult = {
      channelOrder: ['discord', 'telegram'],
      channels: {
        discord: {
          configured: true,
          enabled: true,
          type: 'discord',
          guilds: [
            {
              id: 'guild-1',
              name: 'Ops Guild',
              channels: [{ id: 'general', name: 'General' }],
            },
          ],
        },
        telegram: { configured: true, enabled: false, type: 'telegram' },
      },
    }
    const nodesResult = {
      nodes: [
        { nodeId: 'oc-node-1', displayName: 'MacBook', connected: true, commands: ['device.status'] },
      ],
    }

    let toolCallCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
        // Phase 2 /api/discover: return 404 to trigger fallback
        if ((url as string).includes('/api/discover')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
        }
        // Phase 1 tool invocations
        toolCallCount++
        const body = JSON.parse(opts?.body ?? '{}')
        const result = body.tool === 'agents_list'
          ? agentsResult
          : body.tool === 'session_status'
            ? statusResult
            : body.tool === 'tools.catalog'
            ? toolsResult
            : body.tool === 'channels.status'
              ? channelsResult
              : nodesResult
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result }),
        })
      }),
    )

    const data = await discover(mockConfig)

    expect(toolCallCount).toBe(5)
    expect(data.agents).toHaveLength(2)
    expect(data.agents[0]).toEqual({ id: 'soren', name: 'Soren', default: undefined })
    expect(data.agents[1]).toEqual({ id: 'atlas', name: 'Atlas', default: true })
    expect(data.models).toHaveLength(1)
    expect(data.models[0].id).toBe('claude-sonnet-4-5')
    expect(data.models[0].alias).toBe('sonnet')
    expect(data.channels).toEqual([
      { id: 'discord', enabled: true, type: 'discord' },
      { id: 'telegram', enabled: false, type: 'telegram' },
    ])
    expect(data.channelTargets).toEqual([
      { id: 'channel:general', label: 'General (Ops Guild) discord', provider: 'discord', guildId: 'guild-1' },
    ])
    expect(data.skills).toEqual([])
    expect(data.tools).toEqual(['lobster', 'message'])
    expect(data.nodes).toEqual([
      { id: 'oc-node-1', name: 'MacBook', connected: true, commands: ['device.status'] },
    ])
    expect(data.effectiveTools).toBeNull()
  })

  it('maps tools.effective into effective tool discovery when session_status exposes a session key', async () => {
    const effectiveFrames = mockGatewayRpc({
      agentId: 'main',
      profile: 'messaging',
      groups: [
        {
          id: 'core',
          label: 'Built-in tools',
          source: 'core',
          tools: [{ id: 'lobster' }, { id: 'message' }],
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
        if (url.includes('/api/discover')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
        }
        const body = JSON.parse(opts?.body ?? '{}')
        const result = body.tool === 'agents_list'
          ? { agents: [{ id: 'main', name: 'Main' }] }
          : body.tool === 'session_status'
            ? { details: { sessionKey: 'agent:main:main', model: 'gpt-5', modelProvider: 'openai' } }
            : body.tool === 'tools.catalog'
              ? { groups: [{ id: 'messaging', tools: [{ id: 'message' }, { id: 'lobster' }] }] }
              : body.tool === 'channels.status'
                ? { channelOrder: [], channels: {} }
                : { nodes: [] }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result }),
        })
      }),
    )

    const data = await discover(mockConfig)

    expect(data.models).toEqual([{ id: 'gpt-5', alias: undefined, provider: 'openai' }])
    expect(data.effectiveTools).toEqual({
      agentId: 'main',
      sessionKey: 'agent:main:main',
      profile: 'messaging',
      tools: ['lobster', 'message'],
    })
    expect(effectiveFrames.map((frame) => frame.method)).toEqual(['connect', 'tools.effective'])
    expect((effectiveFrames[0].params as { auth?: { token?: string }; scopes?: string[] }).auth?.token).toBe('test-token')
    expect((effectiveFrames[0].params as { auth?: { token?: string }; scopes?: string[] }).scopes).toEqual(['operator.read'])
    expect(effectiveFrames[1].params).toEqual({ sessionKey: 'agent:main:main', agentId: 'main' })
  })

  it('uses read-scope Gateway RPC discovery for hosted tokenless configs', async () => {
    const frames = mockHostedGatewayRpc({
      agents: {
        defaultId: 'main',
        mainKey: 'main',
        scope: 'per-sender',
        agents: [{ id: 'main', name: 'Main' }],
      },
      sessionStatus: {
        sessionKey: 'main',
        details: { model: 'gpt-5', modelProvider: 'openai' },
      },
      tools: { groups: [{ id: 'core', tools: [{ id: 'lobster' }, { id: 'message' }] }] },
      channels: {
        channelOrder: ['discord'],
        channels: {
          discord: {
            enabled: true,
            type: 'discord',
            targets: [{ id: 'announcements', name: 'Announcements' }],
          },
        },
      },
      nodes: {
        nodes: [{ nodeId: 'oc-node-1', displayName: 'MacBook', connected: true }],
      },
      effective: {
        agentId: 'main',
        groups: [{ id: 'core', tools: [{ id: 'lobster' }] }],
      },
    })

    const data = await discover({ url: '', token: '', persist: false })

    expect(data.agents).toEqual([{ id: 'main', name: 'Main', default: true }])
    expect(data.models).toEqual([{ id: 'gpt-5', alias: undefined, provider: 'openai' }])
    expect(data.tools).toEqual(['lobster', 'message'])
    expect(data.channels).toEqual([{ id: 'discord', enabled: true, type: 'discord' }])
    expect(data.channelTargets).toEqual([
      { id: 'channel:announcements', label: 'Announcements discord', provider: 'discord' },
    ])
    expect(data.nodes).toEqual([{ id: 'oc-node-1', name: 'MacBook', connected: true }])
    expect(data.effectiveTools).toEqual({
      agentId: 'main',
      sessionKey: 'agent:main:main',
      profile: undefined,
      tools: ['lobster'],
    })
    const connectFrames = frames.filter((frame) => frame.method === 'connect')
    expect(connectFrames).toHaveLength(6)
    const writeConnect = connectFrames.find((frame) =>
      (frame.params as { scopes?: string[] }).scopes?.includes('operator.write'),
    )
    expect(writeConnect?.params).toMatchObject({
      scopes: ['operator.read', 'operator.write'],
      caps: ['tool-events'],
    })
    for (const frame of connectFrames.filter((frame) => frame !== writeConnect)) {
      expect((frame.params as { scopes?: string[] }).scopes).toEqual(['operator.read'])
      expect((frame.params as { auth?: unknown }).auth).toBeUndefined()
    }
    expect(frames.map((frame) => frame.method).sort()).toEqual([
      'agents.list',
      'channels.status',
      'connect',
      'connect',
      'connect',
      'connect',
      'connect',
      'connect',
      'node.list',
      'tools.catalog',
      'tools.effective',
      'tools.invoke',
    ])
  })

  it('uses /api/discover when available and returns channels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          agents: [{ id: 'main', default: true, name: 'Main Agent' }],
          models: [],
          channels: [{ id: 'discord', enabled: true, type: 'discord' }],
          skills: [],
          tools: [],
        }),
      }),
    )
    const result = await discover(mockConfig)
    expect(result.channels).toHaveLength(1)
    expect(result.channels[0].id).toBe('discord')
    expect(result.agents).toHaveLength(1)
  })

  it('falls back to Phase 1 when /api/discover returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
        if ((url as string).includes('/api/discover')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
        }
        const body = JSON.parse(opts?.body ?? '{}')
        const result = body.tool === 'agents_list'
          ? { agents: [{ id: 'main' }] }
          : {}
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, result }) })
      }),
    )
    const result = await discover(mockConfig)
    // Phase 1 fallback does not populate channels
    expect(result.channels).toHaveLength(0)
    expect(result.agents).toHaveLength(1)
  })

  it('throws on 401 auth failure', async () => {
    vi.stubGlobal('fetch', mockFetchHttpError(401, 'Unauthorized'))
    await expect(discover(mockConfig)).rejects.toThrow('Gateway 401')
  })

  it('handles partial failures gracefully (one tool fails, other succeeds)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
        // Phase 2: return 404 to trigger fallback
        if ((url as string).includes('/api/discover')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
        }
        const body = JSON.parse(opts?.body ?? '{}')
        if (body.tool === 'agents_list') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, result: { agents: [{ id: 'dave', name: 'Dave' }] } }),
          })
        }
        // session_status fails
        return Promise.reject(new Error('network error'))
      }),
    )

    const data = await discover(mockConfig)
    expect(data.agents).toHaveLength(1)
    expect(data.models).toEqual([])
  })

  it('handles tool-level errors (ok: false) gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        // Phase 2: return 404 to trigger fallback
        if ((url as string).includes('/api/discover')) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
        }
        // Phase 1 tool call returns ok: false
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: false, error: { message: 'Not permitted' } }),
        })
      }),
    )

    await expect(discover(mockConfig)).rejects.toThrow('Not permitted')
  })
})

describe('testConnection()', () => {
  it('returns true when discover succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: {} }),
      }),
    )

    const result = await testConnection(mockConfig)
    expect(result).toBe(true)
  })

  it('returns false when discover throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await testConnection(mockConfig)
    expect(result).toBe(false)
  })
})

describe('loadConfig() / saveConfig() / clearConfig()', () => {
  it('round-trips config through localStorage', () => {
    saveConfig(mockConfig)
    const loaded = loadConfig()
    expect(loaded).toEqual(mockConfig)
  })

  it('returns null when nothing is saved', () => {
    expect(loadConfig()).toBeNull()
  })

  it('returns null for malformed JSON in localStorage', () => {
    localStorage.setItem('lobster-gateway', '{not-valid-json')
    expect(loadConfig()).toBeNull()
  })

  it('returns null when saved object is missing required fields', () => {
    localStorage.setItem('lobster-gateway', JSON.stringify({ url: 'http://localhost' }))
    expect(loadConfig()).toBeNull()
  })

  it('clearConfig removes saved config', () => {
    saveConfig(mockConfig)
    clearConfig()
    expect(loadConfig()).toBeNull()
  })
})

describe('loadHostedGatewayConfig()', () => {
  it('returns a non-persistent same-origin gateway from runtime injection', () => {
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: true,
    }

    expect(loadHostedGatewayConfig()).toEqual({
      id: 'openclaw-hosted',
      name: 'Hosting OpenClaw gateway',
      url: '',
      token: '',
      persist: false,
    })
  })

  it('uses explicit runtime values when provided', () => {
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      id: 'custom-host',
      name: 'Custom host',
      url: 'http://gateway.example',
      token: 'runtime-token',
      persist: true,
    }

    expect(loadHostedGatewayConfig()).toEqual({
      id: 'custom-host',
      name: 'Custom host',
      url: 'http://gateway.example',
      token: 'runtime-token',
      persist: true,
    })
  })

  it('hydrates hosted gateway token from a URL fragment and removes it from the address bar', () => {
    window.history.replaceState(null, '', '/plugins/lobster-builder/#token=fragment-token&tab=builder')
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: true,
    }

    expect(loadHostedGatewayConfig()).toEqual({
      id: 'openclaw-hosted',
      name: 'Hosting OpenClaw gateway',
      url: '',
      token: 'fragment-token',
      persist: false,
    })
    expect(window.location.hash).toBe('#tab=builder')
    expect(sessionStorage.getItem(`lobster-builder.gateway.token.v1:ws://${window.location.host}`)).toBe('fragment-token')
  })

  it('reuses a hosted session token without persisting it to localStorage', () => {
    sessionStorage.setItem(`lobster-builder.gateway.token.v1:ws://${window.location.host}`, 'session-token')
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: true,
    }

    expect(loadHostedGatewayConfig()).toEqual({
      id: 'openclaw-hosted',
      name: 'Hosting OpenClaw gateway',
      url: '',
      token: 'session-token',
      persist: false,
    })
    expect(localStorage.getItem('lobster-gateway')).toBeNull()
  })

  it('can reuse OpenClaw Control UI session token for the same hosted gateway origin', () => {
    sessionStorage.setItem(`openclaw.control.token.v1:ws://${window.location.host}`, 'openclaw-session-token')
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: true,
    }

    expect(loadHostedGatewayConfig()?.token).toBe('openclaw-session-token')
  })

  it('migrates a legacy OpenClaw Control UI token without deleting it', () => {
    sessionStorage.setItem('openclaw.control.token.v1', 'legacy-openclaw-token')
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: true,
    }

    expect(loadHostedGatewayConfig()?.token).toBe('legacy-openclaw-token')
    expect(sessionStorage.getItem(`lobster-builder.gateway.token.v1:ws://${window.location.host}`)).toBe('legacy-openclaw-token')
    expect(sessionStorage.getItem('openclaw.control.token.v1')).toBe('legacy-openclaw-token')
  })

  it('does not attach a legacy OpenClaw Control UI token to a remote gateway URL', async () => {
    const frames = mockHostedGatewayRpc({
      agents: { agents: [] },
      sessionStatus: {},
      tools: { groups: [] },
      channels: { channels: {} },
      nodes: { nodes: [] },
      effective: { groups: [] },
    })
    sessionStorage.setItem('openclaw.control.token.v1', 'legacy-openclaw-token')

    await callGatewayRpc({ url: 'http://remote-gateway.example', token: '', persist: false }, 'agents.list')

    const connectFrame = frames.find((frame) => frame.method === 'connect')
    expect(connectFrame?.params).not.toMatchObject({
      auth: { token: 'legacy-openclaw-token' },
    })
    expect(sessionStorage.getItem('lobster-builder.gateway.token.v1:http://remote-gateway.example')).toBeNull()
    expect(sessionStorage.getItem('openclaw.control.token.v1')).toBe('legacy-openclaw-token')
  })

  it('does not attach a legacy OpenClaw Control UI token to a same-host different-origin gateway URL', async () => {
    const frames = mockHostedGatewayRpc({
      agents: { agents: [] },
      sessionStatus: {},
      tools: { groups: [] },
      channels: { channels: {} },
      nodes: { nodes: [] },
      effective: { groups: [] },
    })
    const crossSchemeUrl = `${window.location.protocol === 'https:' ? 'http:' : 'https:'}//${window.location.host}`
    sessionStorage.setItem('openclaw.control.token.v1', 'legacy-openclaw-token')

    await callGatewayRpc({ url: crossSchemeUrl, token: '', persist: false }, 'agents.list')

    const connectFrame = frames.find((frame) => frame.method === 'connect')
    expect(connectFrame?.params).not.toMatchObject({
      auth: { token: 'legacy-openclaw-token' },
    })
    expect(sessionStorage.getItem(`lobster-builder.gateway.token.v1:${crossSchemeUrl}`)).toBeNull()
    expect(sessionStorage.getItem('openclaw.control.token.v1')).toBe('legacy-openclaw-token')
  })

  it('hydrates same-origin Gateway RPC calls from the hosted session token', async () => {
    const frames = mockHostedGatewayRpc({
      agents: { agents: [] },
      sessionStatus: {},
      tools: { groups: [] },
      channels: { channels: {} },
      nodes: { nodes: [] },
      effective: { groups: [] },
    })
    sessionStorage.setItem(`lobster-builder.gateway.token.v1:ws://${window.location.host}`, 'session-token')

    await callGatewayRpc({ url: '', token: '', persist: false }, 'agents.list')

    const connectFrame = frames.find((frame) => frame.method === 'connect')
    expect(connectFrame?.params).toMatchObject({
      auth: { token: 'session-token' },
    })
  })

  it('hydrates concrete Gateway RPC URLs from the same-origin hosted session token', async () => {
    const frames = mockHostedGatewayRpc({
      agents: { agents: [] },
      sessionStatus: {},
      tools: { groups: [] },
      channels: { channels: {} },
      nodes: { nodes: [] },
      effective: { groups: [] },
    })
    sessionStorage.setItem(`lobster-builder.gateway.token.v1:ws://${window.location.host}`, 'session-token')

    await callGatewayRpc({ url: `http://${window.location.host}`, token: '', persist: false }, 'agents.list')

    const connectFrame = frames.find((frame) => frame.method === 'connect')
    expect(connectFrame?.params).toMatchObject({
      auth: { token: 'session-token' },
    })
  })

  it('returns null when runtime auto-connect is explicitly disabled', () => {
    window.__LOBSTER_BUILDER_GATEWAY__ = {
      hosted: true,
      autoConnect: false,
    }

    expect(loadHostedGatewayConfig()).toBeNull()
  })
})

describe('saved gateway list', () => {
  it('saves multiple gateways without embedding them in the active config shape', () => {
    saveGateway({ id: 'home', name: 'Home', url: 'http://home:18789', token: 'home-token' })
    saveGateway({ id: 'rescue', name: 'Rescue', url: 'http://rescue:18789', token: 'rescue-token' })

    const gateways = loadGateways()
    expect(gateways.map((g) => g.id)).toEqual(['rescue', 'home'])
    expect(loadConfig()).toEqual({
      id: 'rescue',
      name: 'Rescue',
      url: 'http://rescue:18789',
      token: 'rescue-token',
    })
  })

  it('removes a saved gateway and clears the active config when it was selected', () => {
    saveGateway({ id: 'home', name: 'Home', url: 'http://home:18789', token: 'home-token' })
    expect(loadConfig()).not.toBeNull()

    const remaining = deleteGateway('home')
    expect(remaining).toEqual([])
    expect(loadConfig()).toBeNull()
  })
})
