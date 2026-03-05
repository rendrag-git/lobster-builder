import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { discover, testConnection, loadConfig, saveConfig, clearConfig } from '../lib/gateway-client'
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

beforeEach(() => {
  vi.stubGlobal('fetch', undefined)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('discover()', () => {
  it('maps agents_list and session_status results into DiscoveryData', async () => {
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

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, opts) => {
        callCount++
        const body = JSON.parse(opts.body)
        const result = body.tool === 'agents_list' ? agentsResult : statusResult
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result }),
        })
      }),
    )

    const data = await discover(mockConfig)

    expect(callCount).toBe(2)
    expect(data.agents).toHaveLength(2)
    expect(data.agents[0]).toEqual({ id: 'soren', name: 'Soren', default: undefined })
    expect(data.agents[1]).toEqual({ id: 'atlas', name: 'Atlas', default: true })
    expect(data.models).toHaveLength(1)
    expect(data.models[0].id).toBe('claude-sonnet-4-5')
    expect(data.models[0].alias).toBe('sonnet')
    expect(data.channels).toEqual([])
    expect(data.skills).toEqual([])
    expect(data.tools).toEqual([])
  })

  it('throws on 401 auth failure', async () => {
    vi.stubGlobal('fetch', mockFetchHttpError(401, 'Unauthorized'))
    await expect(discover(mockConfig)).rejects.toThrow('Gateway 401')
  })

  it('handles partial failures gracefully (one tool fails, other succeeds)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, opts) => {
        const body = JSON.parse(opts.body)
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
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: { message: 'Not permitted' } }),
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
