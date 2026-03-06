export interface GatewayConfig {
  url: string   // e.g. "http://localhost:18789" or "" for same-origin proxy
  token: string // bearer token
}

export interface DiscoveryData {
  agents: Array<{ id: string; name?: string; default?: boolean }>
  models: Array<{ id: string; alias?: string; provider?: string }>
  channels: Array<{ id: string; enabled: boolean; type: string }>
  skills: Array<{ id: string; name: string; description?: string }>
  tools: string[]
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const TIMEOUT_MS = 5000
const STORAGE_KEY = 'lobster-gateway'

async function invokeGatewayTool(
  config: GatewayConfig,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const base = config.url || ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${base}/tools/invoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool, args }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Gateway ${res.status}: ${res.statusText}`)
    }

    const body = await res.json()
    if (!body.ok) {
      throw new Error(body.error?.message ?? 'Tool invocation failed')
    }
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

function extractModels(statusResult: unknown): DiscoveryData['models'] {
  if (!statusResult || typeof statusResult !== 'object') return []
  const r = statusResult as Record<string, unknown>

  const models: DiscoveryData['models'] = []

  // Try to extract model from current session info
  if (r.model && typeof r.model === 'string') {
    models.push({ id: r.model, alias: r.model_alias as string | undefined })
  }

  // Try a models/aliases array if present
  if (Array.isArray(r.models)) {
    for (const m of r.models) {
      if (m && typeof m === 'object') {
        const model = m as Record<string, unknown>
        models.push({
          id: String(model.id ?? model.model ?? ''),
          alias: model.alias as string | undefined,
          provider: model.provider as string | undefined,
        })
      }
    }
  }

  return models
}

async function fetchDiscoverEndpoint(config: GatewayConfig): Promise<DiscoveryData> {
  const base = config.url || ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/discover`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    })
    if (res.status === 404) throw new Error('404: /api/discover not available')
    if (!res.ok) throw new Error(`Gateway ${res.status}: ${res.statusText}`)
    return await res.json() as DiscoveryData
  } finally {
    clearTimeout(timer)
  }
}

export async function discover(config: GatewayConfig): Promise<DiscoveryData> {
  // Try Phase 2 endpoint first
  try {
    return await fetchDiscoverEndpoint(config)
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('404')) throw err
    console.info('[gateway] /api/discover not available, using Phase 1 fallback')
  }

  // Phase 1 fallback: agents_list + session_status
  // agents_list is the primary call — if it throws (e.g. 401), propagate the error
  const [agentsSettled, statusSettled] = await Promise.allSettled([
    invokeGatewayTool(config, 'agents_list'),
    invokeGatewayTool(config, 'session_status'),
  ])

  if (agentsSettled.status === 'rejected') {
    throw agentsSettled.reason
  }
  if (statusSettled.status === 'rejected') {
    console.warn('[gateway] session_status failed:', (statusSettled.reason as Error).message)
  }

  const agentsResult = agentsSettled.value
  const statusResult = statusSettled.status === 'fulfilled' ? statusSettled.value : null

  const agents: DiscoveryData['agents'] = []
  if (agentsResult && typeof agentsResult === 'object') {
    const r = agentsResult as Record<string, unknown>
    if (Array.isArray(r.agents)) {
      for (const a of r.agents) {
        if (a && typeof a === 'object') {
          const agent = a as Record<string, unknown>
          agents.push({
            id: String(agent.id ?? ''),
            name: agent.name as string | undefined,
            default: agent.default as boolean | undefined,
          })
        }
      }
    }
  }

  return {
    agents,
    models: extractModels(statusResult),
    channels: [],
    skills: [],
    tools: [],
  }
}

export async function testConnection(config: GatewayConfig): Promise<boolean> {
  try {
    await discover(config)
    return true
  } catch {
    return false
  }
}

export function loadConfig(): GatewayConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.url !== 'string' || typeof parsed?.token !== 'string') return null
    return { url: parsed.url, token: parsed.token }
  } catch {
    return null
  }
}

export function saveConfig(config: GatewayConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: config.url, token: config.token }))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}
