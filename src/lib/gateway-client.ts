import {
  buildOpenClawDeviceAuthPayload,
  loadOpenClawDeviceAuthToken,
  loadOrCreateOpenClawDeviceIdentity,
  signOpenClawDevicePayload,
  storeOpenClawDeviceAuthToken,
  type OpenClawDeviceIdentity,
} from './openclaw-device-auth'

export interface GatewayConfig {
  id?: string
  name?: string
  url: string   // e.g. "http://localhost:18789" or "" for same-origin proxy
  token: string // bearer token
  persist?: boolean
}

export interface SavedGateway extends GatewayConfig {
  id: string
  name: string
}

export interface DiscoveryData {
  agents: Array<{ id: string; name?: string; default?: boolean }>
  models: Array<{ id: string; alias?: string; provider?: string }>
  channels: Array<{ id: string; enabled: boolean; type: string }>
  channelTargets?: Array<{ id: string; label?: string; provider: string; guildId?: string; type?: string }>
  channelDiscoveryStatus?: 'available' | 'unavailable'
  skills: Array<{ id: string; name: string; description?: string }>
  tools: string[]
  nodes?: Array<{ id: string; name?: string; connected?: boolean; commands?: string[] }>
  effectiveTools?: {
    agentId: string
    sessionKey: string
    profile?: string
    tools: string[]
  } | null
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const TIMEOUT_MS = 5000
const GATEWAY_PROTOCOL_VERSION = 4
const STORAGE_KEY = 'lobster-gateway'
const GATEWAYS_STORAGE_KEY = 'lobster-gateways'
const HOSTED_TOKEN_SESSION_KEY_PREFIX = 'lobster-builder.gateway.token.v1:'
const OPENCLAW_TOKEN_SESSION_KEY_PREFIX = 'openclaw.control.token.v1:'
const OPENCLAW_LEGACY_TOKEN_SESSION_KEY = 'openclaw.control.token.v1'
const CONTROL_UI_OPERATOR_ROLE = 'operator'
const CONTROL_UI_READ_SCOPES = ['operator.read']
const CONTROL_UI_WRITE_SCOPES = [
  'operator.read',
  'operator.write',
]
const CLIENT_VERSION = '0.1.0'

type ConnectChallengePayload = {
  nonce?: unknown
}

type ConnectAuthSelection = {
  token?: string
  deviceToken?: string
}

type GatewayRpcOptions = {
  scopes?: string[]
  caps?: string[]
}

type HostedGatewayRuntimeConfig = {
  id?: unknown
  name?: unknown
  url?: unknown
  token?: unknown
  autoConnect?: unknown
  persist?: unknown
  hosted?: unknown
}

declare global {
  interface Window {
    __LOBSTER_BUILDER_GATEWAY__?: HostedGatewayRuntimeConfig
  }
}

function createRpcId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
  if (randomUUID) return `${prefix}:${randomUUID()}`
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function resolveGatewayWebSocketUrl(config: GatewayConfig): string {
  const rawUrl = config.url.trim()
  const url = rawUrl
    ? new URL(rawUrl)
    : new URL('/ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function readSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function resolveGatewayTokenScope(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}`
  }
  try {
    const parsed = new URL(trimmed, window.location.href)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
    return `${parsed.protocol}//${parsed.host}${pathname}`
  } catch {
    return trimmed
  }
}

function hostedTokenSessionKey(rawUrl: string): string {
  return `${HOSTED_TOKEN_SESSION_KEY_PREFIX}${resolveGatewayTokenScope(rawUrl)}`
}

function openClawTokenSessionKey(rawUrl: string): string {
  return `${OPENCLAW_TOKEN_SESSION_KEY_PREFIX}${resolveGatewayTokenScope(rawUrl)}`
}

function readHostedSessionToken(rawUrl: string): string {
  const storage = readSessionStorage()
  if (!storage) return ''
  try {
    const scopedToken = storage.getItem(hostedTokenSessionKey(rawUrl))?.trim()
    if (scopedToken) return scopedToken
    const openClawToken = storage.getItem(openClawTokenSessionKey(rawUrl))?.trim()
    if (openClawToken) return openClawToken
    const legacyToken = storage.getItem(OPENCLAW_LEGACY_TOKEN_SESSION_KEY)?.trim()
    if (legacyToken) {
      storage.setItem(hostedTokenSessionKey(rawUrl), legacyToken)
      return legacyToken
    }
    return ''
  } catch {
    return ''
  }
}

function withHostedSessionToken(config: GatewayConfig): GatewayConfig {
  if (config.token.trim()) return config
  const token = readHostedSessionToken(config.url) || (config.url.trim() ? readHostedSessionToken('') : '')
  return token ? { ...config, token } : config
}

function writeHostedSessionToken(rawUrl: string, token: string): void {
  const storage = readSessionStorage()
  if (!storage) return
  try {
    const key = hostedTokenSessionKey(rawUrl)
    const normalized = token.trim()
    if (normalized) {
      storage.setItem(key, normalized)
    } else {
      storage.removeItem(key)
    }
  } catch {
    // best-effort
  }
}

function consumeUrlToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    const params = new URLSearchParams(url.search)
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
    const token = (hashParams.get('token') ?? params.get('token') ?? '').trim()
    let shouldCleanUrl = false
    if (hashParams.has('token')) {
      hashParams.delete('token')
      shouldCleanUrl = true
    }
    if (params.has('token')) {
      params.delete('token')
      shouldCleanUrl = true
    }
    if (shouldCleanUrl && typeof window.history?.replaceState === 'function') {
      url.search = params.toString()
      const nextHash = hashParams.toString()
      url.hash = nextHash ? `#${nextHash}` : ''
      window.history.replaceState(window.history.state, '', url)
    }
    return token
  } catch {
    return ''
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function errorMessageFromRpc(frame: Record<string, unknown>, fallback: string): string {
  const error = readObject(frame.error)
  const message = typeof error?.message === 'string' ? error.message : fallback
  const code = typeof error?.code === 'string' ? error.code : ''
  return code ? `${code}: ${message}` : message
}

function storedTokenHasScopes(storedScopes: string[], requestedScopes: string[]): boolean {
  return requestedScopes.every((scope) => storedScopes.includes(scope))
}

function selectConnectAuth(
  config: GatewayConfig,
  identity: OpenClawDeviceIdentity | null,
  requestedScopes: string[],
): ConnectAuthSelection {
  const explicitToken = config.token.trim() || undefined
  if (!identity) {
    return explicitToken ? { token: explicitToken } : {}
  }

  const storedEntry = loadOpenClawDeviceAuthToken({
    deviceId: identity.deviceId,
    role: CONTROL_UI_OPERATOR_ROLE,
  })
  const storedScopes = storedEntry?.scopes ?? []
  const storedToken = storedTokenHasScopes(storedScopes, requestedScopes)
    ? storedEntry?.token
    : undefined

  if (explicitToken) {
    return { token: explicitToken }
  }
  if (storedToken) {
    return {
      token: storedToken,
      deviceToken: storedToken,
    }
  }
  return {}
}

function authPayloadFromSelection(selection: ConnectAuthSelection): Record<string, string> | undefined {
  const auth: Record<string, string> = {}
  if (selection.token) auth.token = selection.token
  if (selection.deviceToken) auth.deviceToken = selection.deviceToken
  return Object.keys(auth).length > 0 ? auth : undefined
}

async function buildConnectDevice(params: {
  identity: OpenClawDeviceIdentity | null
  authToken?: string
  nonce: string
  scopes: string[]
}) {
  if (!params.identity) return undefined
  const signedAt = Date.now()
  const payload = buildOpenClawDeviceAuthPayload({
    deviceId: params.identity.deviceId,
    clientId: 'openclaw-control-ui',
    clientMode: 'ui',
    role: CONTROL_UI_OPERATOR_ROLE,
    scopes: params.scopes,
    signedAtMs: signedAt,
    token: params.authToken ?? null,
    nonce: params.nonce,
  })
  return {
    id: params.identity.deviceId,
    publicKey: params.identity.publicKey,
    signature: await signOpenClawDevicePayload(params.identity.privateKey, payload),
    signedAt,
    nonce: params.nonce,
  }
}

async function connectFrame(
  config: GatewayConfig,
  connectId: string,
  nonce: string,
  opts: GatewayRpcOptions = {},
) {
  const identity = await loadOrCreateOpenClawDeviceIdentity()
  const scopes = opts.scopes?.length ? opts.scopes : CONTROL_UI_READ_SCOPES
  const selectedAuth = selectConnectAuth(config, identity, scopes)
  return {
    type: 'req',
    id: connectId,
    method: 'connect',
    params: {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: {
        id: 'openclaw-control-ui',
        displayName: 'Lobster Builder',
        version: CLIENT_VERSION,
        platform: 'browser',
        mode: 'ui',
      },
      caps: opts.caps ?? [],
      role: CONTROL_UI_OPERATOR_ROLE,
      scopes,
      device: await buildConnectDevice({
        identity,
        authToken: selectedAuth.token,
        nonce,
        scopes,
      }),
      auth: authPayloadFromSelection(selectedAuth),
    },
  }
}

function storeDeviceTokenFromHello(payload: unknown) {
  const record = readObject(payload)
  const auth = readObject(record?.auth)
  const token = typeof auth?.deviceToken === 'string' && auth.deviceToken.trim()
    ? auth.deviceToken.trim()
    : null
  const role = typeof auth?.role === 'string' && auth.role.trim()
    ? auth.role.trim()
    : CONTROL_UI_OPERATOR_ROLE
  if (!token) return
  void loadOrCreateOpenClawDeviceIdentity().then((identity) => {
    if (!identity) return
    storeOpenClawDeviceAuthToken({
      deviceId: identity.deviceId,
      role,
      token,
      scopes: Array.isArray(auth?.scopes)
        ? auth.scopes.filter((scope): scope is string => typeof scope === 'string')
        : [],
    })
  })
}

export async function callGatewayRpc(
  config: GatewayConfig,
  method: string,
  params: Record<string, unknown> = {},
  opts: GatewayRpcOptions = {},
): Promise<unknown> {
  config = withHostedSessionToken(config)
  if (typeof WebSocket !== 'function') {
    throw new Error('Gateway WebSocket is not available in this browser context.')
  }

  const url = resolveGatewayWebSocketUrl(config)
  const connectId = createRpcId('connect')
  const requestId = createRpcId(method)

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null
    let settled = false
    let methodSent = false
    const timer = setTimeout(() => {
      finish('reject', new Error(`Gateway RPC timeout for ${method}`))
    }, TIMEOUT_MS)

    const finish = (kind: 'resolve' | 'reject', value: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
      if (kind === 'resolve') {
        resolve(value)
      } else {
        reject(value)
      }
    }

    const send = (frame: Record<string, unknown>) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Gateway WebSocket is not open.')
      }
      ws.send(JSON.stringify(frame))
    }

    const sendMethodRequest = () => {
      if (methodSent) return
      methodSent = true
      send({ type: 'req', id: requestId, method, params })
    }

    try {
      ws = new WebSocket(url)
    } catch (err) {
      finish('reject', err instanceof Error ? err : new Error(String(err)))
      return
    }

    ws.onerror = () => {
      finish('reject', new Error(`Gateway WebSocket error contacting ${url}`))
    }
    ws.onclose = (event) => {
      const reason = typeof event?.reason === 'string' && event.reason.trim()
        ? `: ${event.reason.trim()}`
        : ''
      finish('reject', new Error(`Gateway WebSocket closed before ${method} completed${reason}.`))
    }
    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as unknown
        const record = readObject(frame)
        if (!record) return

        if (record.type === 'event' && record.event === 'connect.challenge') {
          const payload = readObject(record.payload) as ConnectChallengePayload | null
          const nonce = typeof payload?.nonce === 'string' ? payload.nonce : ''
          void connectFrame(config, connectId, nonce, opts)
            .then((frame) => send(frame))
            .catch((err) => finish('reject', err instanceof Error ? err : new Error(String(err))))
          return
        }

        if (record.type !== 'res') return
        if (record.id === connectId) {
          if (record.ok !== true) {
            finish('reject', new Error(errorMessageFromRpc(record, 'Gateway connect failed')))
            return
          }
          storeDeviceTokenFromHello(record.payload)
          sendMethodRequest()
          return
        }

        if (record.id === requestId) {
          if (record.ok === true) {
            finish('resolve', record.payload)
          } else {
            finish('reject', new Error(errorMessageFromRpc(record, `${method} failed`)))
          }
        }
      } catch (err) {
        finish('reject', err instanceof Error ? err : new Error(String(err)))
      }
    }
  })
}

export async function invokeGatewayTool(
  config: GatewayConfig,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  config = withHostedSessionToken(config)
  if (!config.token.trim()) {
    const payload = await callGatewayRpc(config, 'tools.invoke', {
      name: tool,
      args,
    }, { scopes: CONTROL_UI_WRITE_SCOPES, caps: ['tool-events'] })
    const result = readObject(payload)
    if (!result) return payload
    if (result.ok === false) {
      const error = readObject(result.error)
      const message = typeof error?.message === 'string' ? error.message : 'Tool invocation failed'
      throw new Error(message)
    }
    return result.output
  }

  const base = config.url || ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await fetch(`${base}/tools/invoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tool, args }),
        signal: controller.signal,
      })
    } catch (err) {
      const target = base || 'same-origin /tools/invoke'
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`Network error contacting ${target}: ${detail}. Leave Gateway URL blank for the local dev proxy unless the gateway allows browser CORS.`)
    }

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

async function invokeGatewayMethod(
  config: GatewayConfig,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    return await invokeGatewayTool(config, method, params)
  } catch (toolErr) {
    try {
      return await callGatewayRpc(config, method, params)
    } catch {
      throw toolErr
    }
  }
}

function extractSessionInfo(statusResult: unknown): { sessionKey?: string; agentId?: string } {
  const result = readObject(statusResult)
  if (!result) return {}
  const details = readObject(result.details)
  const sessionKey =
    (typeof result.sessionKey === 'string' ? result.sessionKey : undefined) ??
    (typeof details?.sessionKey === 'string' ? details.sessionKey : undefined)
  const explicitAgentId =
    (typeof result.agentId === 'string' ? result.agentId : undefined) ??
    (typeof details?.agentId === 'string' ? details.agentId : undefined)
  const agentId = explicitAgentId ?? sessionKey?.match(/^agent:([^:]+):/)?.[1]
  return {
    ...(sessionKey ? { sessionKey } : {}),
    ...(agentId ? { agentId } : {}),
  }
}

function extractModels(statusResult: unknown): DiscoveryData['models'] {
  const r = readObject(statusResult)
  if (!r) return []
  const details = readObject(r.details)

  const models: DiscoveryData['models'] = []

  // Try to extract model from current session info
  const model = typeof r.model === 'string'
    ? r.model
    : typeof details?.model === 'string'
      ? details.model
      : undefined
  if (model) {
    models.push({
      id: model,
      alias: (typeof r.model_alias === 'string' ? r.model_alias : undefined) ??
        (typeof details?.modelAlias === 'string' ? details.modelAlias : undefined),
      provider: typeof details?.modelProvider === 'string' ? details.modelProvider : undefined,
    })
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
  config = withHostedSessionToken(config)
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

function extractTools(catalogResult: unknown): DiscoveryData['tools'] {
  if (!catalogResult || typeof catalogResult !== 'object') return []
  const tools = new Set<string>()
  const groups = (catalogResult as Record<string, unknown>).groups
  if (!Array.isArray(groups)) return []

  for (const group of groups) {
    if (!group || typeof group !== 'object') continue
    const groupTools = (group as Record<string, unknown>).tools
    if (!Array.isArray(groupTools)) continue
    for (const item of groupTools) {
      if (typeof item === 'string' && item.trim()) {
        tools.add(item.trim())
      } else if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id
        if (typeof id === 'string' && id.trim()) tools.add(id.trim())
      }
    }
  }

  return [...tools].sort()
}

function extractEffectiveTools(
  effectiveResult: unknown,
  sessionInfo: { sessionKey?: string; agentId?: string },
): DiscoveryData['effectiveTools'] {
  const result = readObject(effectiveResult)
  if (!result || !sessionInfo.sessionKey) return null

  const tools = new Set<string>()
  const groups = result.groups
  if (Array.isArray(groups)) {
    for (const group of groups) {
      const groupRecord = readObject(group)
      const groupTools = groupRecord?.tools
      if (!Array.isArray(groupTools)) continue
      for (const item of groupTools) {
        if (typeof item === 'string' && item.trim()) {
          tools.add(item.trim())
        } else {
          const itemRecord = readObject(item)
          const id = itemRecord?.id
          if (typeof id === 'string' && id.trim()) tools.add(id.trim())
        }
      }
    }
  }

  const agentId =
    (typeof result.agentId === 'string' ? result.agentId : undefined) ??
    sessionInfo.agentId ??
    'unknown'
  return {
    agentId,
    sessionKey: sessionInfo.sessionKey,
    profile: typeof result.profile === 'string' ? result.profile : undefined,
    tools: [...tools].sort(),
  }
}

function extractAgentsList(
  agentsResult: unknown,
): Array<{ id: string; name?: string; default?: boolean }> {
  const agents: DiscoveryData['agents'] = []
  const result = readObject(agentsResult)
  if (!result || !Array.isArray(result.agents)) return agents
  const defaultId = typeof result.defaultId === 'string' ? result.defaultId : undefined
  for (const item of result.agents) {
    const agent = readObject(item)
    if (!agent) continue
    const id = typeof agent.id === 'string' ? agent.id : ''
    if (!id) continue
    const identity = readObject(agent.identity)
    const name =
      (typeof agent.name === 'string' ? agent.name : undefined) ??
      (typeof identity?.name === 'string' ? identity.name : undefined)
    agents.push({
      id,
      ...(name ? { name } : {}),
      default: defaultId ? id === defaultId : undefined,
    })
  }
  return agents
}

function extractNodesList(nodesResult: unknown): DiscoveryData['nodes'] {
  const nodes: NonNullable<DiscoveryData['nodes']> = []
  const result = readObject(nodesResult)
  if (!result || !Array.isArray(result.nodes)) return nodes

  for (const item of result.nodes) {
    const node = readObject(item)
    if (!node) continue
    const id =
      (typeof node.nodeId === 'string' ? node.nodeId.trim() : '') ||
      (typeof node.id === 'string' ? node.id.trim() : '')
    if (!id) continue
    const name =
      (typeof node.displayName === 'string' && node.displayName.trim()
        ? node.displayName.trim()
        : undefined) ??
      (typeof node.name === 'string' && node.name.trim()
        ? node.name.trim()
        : undefined)
    const commands = Array.isArray(node.commands)
      ? node.commands.filter((command): command is string => typeof command === 'string' && command.trim().length > 0)
      : undefined

    nodes.push({
      id,
      ...(name ? { name } : {}),
      ...(typeof node.connected === 'boolean' ? { connected: node.connected } : {}),
      ...(commands && commands.length > 0 ? { commands } : {}),
    })
  }

  return nodes
}

function extractChannels(statusResult: unknown): DiscoveryData['channels'] {
  if (!statusResult || typeof statusResult !== 'object') return []
  const result = statusResult as Record<string, unknown>
  const channelOrder = Array.isArray(result.channelOrder)
    ? result.channelOrder.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  const channels = result.channels && typeof result.channels === 'object' && !Array.isArray(result.channels)
    ? result.channels as Record<string, unknown>
    : {}
  const channelAccounts = result.channelAccounts && typeof result.channelAccounts === 'object' && !Array.isArray(result.channelAccounts)
    ? result.channelAccounts as Record<string, unknown>
    : {}

  const ids = new Set<string>(channelOrder)
  for (const id of Object.keys(channels)) ids.add(id)
  for (const id of Object.keys(channelAccounts)) ids.add(id)

  return [...ids].sort().map((id) => {
    const summary = channels[id]
    const summaryRecord = summary && typeof summary === 'object' && !Array.isArray(summary)
      ? summary as Record<string, unknown>
      : {}
    const accounts = Array.isArray(channelAccounts[id]) ? channelAccounts[id] as unknown[] : []
    const anyAccountEnabled = accounts.some((account) => {
      if (!account || typeof account !== 'object' || Array.isArray(account)) return false
      const accountRecord = account as Record<string, unknown>
      return accountRecord.enabled !== false && accountRecord.configured !== false
    })
    const enabled = summaryRecord.enabled !== false && (accounts.length === 0 || anyAccountEnabled)
    return {
      id,
      enabled,
      type: typeof summaryRecord.type === 'string' ? summaryRecord.type : id,
    }
  })
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function channelTargetValue(id: string): string {
  return id.includes(':') ? id : `channel:${id}`
}

function extractChannelTargets(statusResult: unknown): NonNullable<DiscoveryData['channelTargets']> {
  const result = readObject(statusResult)
  if (!result) return []

  const targets = new Map<string, { id: string; label?: string; provider: string; guildId?: string; type?: string }>()
  const addTarget = (
    provider: string | undefined,
    value: unknown,
    inheritedGuildId?: string,
    inheritedGuildName?: string,
  ) => {
    const record = readObject(value)
    const rawId = typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : readString(record, ['target', 'to', 'value', 'channelId', 'id'])
    if (!rawId) return

    const targetProvider = provider ?? readString(record, ['provider', 'channel', 'type'])
    if (!targetProvider) return

    const guildId = readString(record, ['guildId', 'guild_id', 'serverId', 'server_id']) ?? inheritedGuildId
    const name = readString(record, ['name', 'label', 'displayName', 'display_name'])
    const type = readString(record, ['kind', 'type'])
    const id = channelTargetValue(rawId)
    const labelParts = [
      name ?? rawId,
      inheritedGuildName || guildId ? `(${inheritedGuildName ?? guildId})` : '',
      targetProvider,
    ].filter(Boolean)
    targets.set(`${targetProvider}:${guildId ?? ''}:${id}`, {
      id,
      label: labelParts.join(' '),
      provider: targetProvider,
      ...(guildId ? { guildId } : {}),
      ...(type ? { type } : {}),
    })
  }

  const addTargetArray = (
    provider: string | undefined,
    values: unknown,
    inheritedGuildId?: string,
    inheritedGuildName?: string,
  ) => {
    if (!Array.isArray(values)) return
    for (const value of values) addTarget(provider, value, inheritedGuildId, inheritedGuildName)
  }

  addTargetArray(undefined, result.channelTargets)
  addTargetArray(undefined, result.targets)

  const channels = readObject(result.channels)
  if (channels) {
    for (const [provider, value] of Object.entries(channels)) {
      const channelRecord = readObject(value)
      addTargetArray(provider, channelRecord?.targets)
      addTargetArray(provider, channelRecord?.channelTargets)
      addTargetArray(provider, channelRecord?.channels)

      const guilds = channelRecord?.guilds
      if (Array.isArray(guilds)) {
        for (const guild of guilds) {
          const guildRecord = readObject(guild)
          const guildId = readString(guildRecord, ['guildId', 'guild_id', 'serverId', 'server_id', 'id'])
          const guildName = readString(guildRecord, ['name', 'label'])
          addTargetArray(provider, guildRecord?.channels, guildId, guildName)
          addTargetArray(provider, guildRecord?.targets, guildId, guildName)
        }
      }
    }
  }

  const channelAccounts = readObject(result.channelAccounts)
  if (channelAccounts) {
    for (const [provider, accounts] of Object.entries(channelAccounts)) {
      if (!Array.isArray(accounts)) continue
      for (const account of accounts) {
        const accountRecord = readObject(account)
        const guilds = accountRecord?.guilds
        if (Array.isArray(guilds)) {
          for (const guild of guilds) {
            const guildRecord = readObject(guild)
            const guildId = readString(guildRecord, ['guildId', 'guild_id', 'serverId', 'server_id', 'id'])
            const guildName = readString(guildRecord, ['name', 'label'])
            addTargetArray(provider, guildRecord?.channels, guildId, guildName)
            addTargetArray(provider, guildRecord?.targets, guildId, guildName)
          }
        }
        addTargetArray(provider, accountRecord?.channels)
        addTargetArray(provider, accountRecord?.targets)
      }
    }
  }

  return [...targets.values()].sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id))
}

function defaultSessionInfoFromAgentsList(agentsResult: unknown): { sessionKey?: string; agentId?: string } {
  const result = readObject(agentsResult)
  if (!result) return {}
  const defaultId = typeof result.defaultId === 'string' && result.defaultId.trim()
    ? result.defaultId.trim()
    : undefined
  const mainKey = typeof result.mainKey === 'string' && result.mainKey.trim()
    ? result.mainKey.trim()
    : undefined
  if (!defaultId || !mainKey) return {}
  return {
    agentId: defaultId,
    sessionKey: `agent:${defaultId}:${mainKey}`,
  }
}

function defaultSessionInfoFromAnyAgentsResult(agentsResult: unknown): { sessionKey?: string; agentId?: string } {
  const rpcSessionInfo = defaultSessionInfoFromAgentsList(agentsResult)
  if (rpcSessionInfo.sessionKey) return rpcSessionInfo

  const result = readObject(agentsResult)
  if (!result || !Array.isArray(result.agents)) return {}
  const agentRecords = result.agents.map(readObject).filter((agent): agent is Record<string, unknown> => Boolean(agent))
  const defaultAgent =
    agentRecords.find((agent) => agent.default === true) ??
    (agentRecords.length === 1 ? agentRecords[0] : undefined)
  const defaultId = typeof defaultAgent?.id === 'string' && defaultAgent.id.trim()
    ? defaultAgent.id.trim()
    : undefined
  if (!defaultId) return {}
  return {
    agentId: defaultId,
    sessionKey: `agent:${defaultId}:main`,
  }
}

function normalizeSessionInfoForAgents(
  statusSessionInfo: { sessionKey?: string; agentId?: string },
  agentsResult: unknown,
): { sessionKey?: string; agentId?: string } {
  const fallback = defaultSessionInfoFromAnyAgentsResult(agentsResult)
  const rawSessionKey = statusSessionInfo.sessionKey?.trim()
  const agentId = statusSessionInfo.agentId ?? fallback.agentId
  if (!rawSessionKey) {
    return fallback
  }
  if (rawSessionKey === 'main' && fallback.sessionKey) {
    return {
      agentId,
      sessionKey: fallback.sessionKey,
    }
  }
  if (!rawSessionKey.includes(':') && agentId) {
    return {
      agentId,
      sessionKey: `agent:${agentId}:${rawSessionKey}`,
    }
  }
  return {
    sessionKey: rawSessionKey,
    ...(agentId ? { agentId } : {}),
  }
}

async function discoverViaGatewayRpc(config: GatewayConfig): Promise<DiscoveryData> {
  const [agentsSettled, statusSettled] = await Promise.allSettled([
    callGatewayRpc(config, 'agents.list', {}),
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
  const sessionInfo = normalizeSessionInfoForAgents(extractSessionInfo(statusResult), agentsResult)
  const [toolsSettled, channelsSettled, nodesSettled, effectiveSettled] = await Promise.allSettled([
    callGatewayRpc(config, 'tools.catalog', {}),
    callGatewayRpc(config, 'channels.status', { probe: false }),
    callGatewayRpc(config, 'node.list', {}),
    sessionInfo.sessionKey
      ? callGatewayRpc(config, 'tools.effective', {
          sessionKey: sessionInfo.sessionKey,
          ...(sessionInfo.agentId ? { agentId: sessionInfo.agentId } : {}),
        })
      : Promise.resolve(null),
  ])

  if (toolsSettled.status === 'rejected') {
    console.warn('[gateway] tools.catalog failed:', (toolsSettled.reason as Error).message)
  }
  if (channelsSettled.status === 'rejected') {
    console.warn('[gateway] channels.status failed:', (channelsSettled.reason as Error).message)
  }
  if (nodesSettled.status === 'rejected') {
    console.warn('[gateway] node.list failed:', (nodesSettled.reason as Error).message)
  }
  if (effectiveSettled.status === 'rejected') {
    console.warn('[gateway] tools.effective failed:', (effectiveSettled.reason as Error).message)
  }

  const toolsResult = toolsSettled.status === 'fulfilled' ? toolsSettled.value : null
  const channelsResult = channelsSettled.status === 'fulfilled' ? channelsSettled.value : null
  const nodesResult = nodesSettled.status === 'fulfilled' ? nodesSettled.value : null
  const effectiveResult = effectiveSettled.status === 'fulfilled' ? effectiveSettled.value : null

  return {
    agents: extractAgentsList(agentsResult),
    models: extractModels(statusResult),
    channels: extractChannels(channelsResult),
    channelTargets: extractChannelTargets(channelsResult),
    channelDiscoveryStatus: channelsSettled.status === 'fulfilled' ? 'available' : 'unavailable',
    skills: [],
    tools: extractTools(toolsResult),
    nodes: extractNodesList(nodesResult),
    effectiveTools: extractEffectiveTools(effectiveResult, sessionInfo),
  }
}

export async function discover(config: GatewayConfig): Promise<DiscoveryData> {
  if (!config.token.trim()) {
    return discoverViaGatewayRpc(config)
  }

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

  const statusResult = statusSettled.status === 'fulfilled' ? statusSettled.value : null
  const sessionInfo = normalizeSessionInfoForAgents(extractSessionInfo(statusResult), agentsSettled.value)
  const [toolsSettled, channelsSettled, nodesSettled, effectiveSettled] = await Promise.allSettled([
    invokeGatewayMethod(config, 'tools.catalog'),
    invokeGatewayMethod(config, 'channels.status', { probe: false }),
    invokeGatewayMethod(config, 'node.list'),
    sessionInfo.sessionKey
      ? callGatewayRpc(config, 'tools.effective', {
          sessionKey: sessionInfo.sessionKey,
          ...(sessionInfo.agentId ? { agentId: sessionInfo.agentId } : {}),
        })
      : Promise.resolve(null),
  ])

  if (toolsSettled.status === 'rejected') {
    console.warn('[gateway] tools.catalog failed:', (toolsSettled.reason as Error).message)
  }
  if (channelsSettled.status === 'rejected') {
    console.warn('[gateway] channels.status failed:', (channelsSettled.reason as Error).message)
  }
  if (nodesSettled.status === 'rejected') {
    console.warn('[gateway] node.list failed:', (nodesSettled.reason as Error).message)
  }
  if (effectiveSettled.status === 'rejected') {
    console.warn('[gateway] tools.effective failed:', (effectiveSettled.reason as Error).message)
  }

  const agentsResult = agentsSettled.value
  const toolsResult = toolsSettled.status === 'fulfilled' ? toolsSettled.value : null
  const channelsResult = channelsSettled.status === 'fulfilled' ? channelsSettled.value : null
  const nodesResult = nodesSettled.status === 'fulfilled' ? nodesSettled.value : null
  const effectiveResult = effectiveSettled.status === 'fulfilled' ? effectiveSettled.value : null

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
    channels: extractChannels(channelsResult),
    channelTargets: extractChannelTargets(channelsResult),
    channelDiscoveryStatus: channelsSettled.status === 'fulfilled' ? 'available' : 'unavailable',
    skills: [],
    tools: extractTools(toolsResult),
    nodes: extractNodesList(nodesResult),
    effectiveTools: extractEffectiveTools(effectiveResult, sessionInfo),
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
    return {
      ...(typeof parsed.id === 'string' ? { id: parsed.id } : {}),
      ...(typeof parsed.name === 'string' ? { name: parsed.name } : {}),
      url: parsed.url,
      token: parsed.token,
    }
  } catch {
    return null
  }
}

export function loadHostedGatewayConfig(): GatewayConfig | null {
  if (typeof window === 'undefined') return null
  const raw = window.__LOBSTER_BUILDER_GATEWAY__
  if (!raw || typeof raw !== 'object') return null
  if (raw.autoConnect === false) return null
  if (raw.hosted !== true && raw.autoConnect !== true) return null

  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : 'openclaw-hosted'
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim()
    : 'Hosting OpenClaw gateway'
  const url = typeof raw.url === 'string' ? raw.url : ''
  const injectedToken = typeof raw.token === 'string' ? raw.token.trim() : ''
  const urlToken = consumeUrlToken()
  if (urlToken) writeHostedSessionToken(url, urlToken)
  const token = injectedToken || urlToken || readHostedSessionToken(url)

  return {
    id,
    name,
    url,
    token,
    persist: raw.persist === true,
  }
}

export function saveConfig(config: GatewayConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: config.url, token: config.token }))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function gatewayIdFromConfig(config: GatewayConfig): string {
  if (config.id?.trim()) return config.id.trim()
  const urlPart = config.url.trim() || 'same-origin'
  return `gateway:${urlPart}`
}

function gatewayNameFromConfig(config: GatewayConfig): string {
  if (config.name?.trim()) return config.name.trim()
  if (!config.url.trim()) return 'Same-origin gateway'
  try {
    const url = new URL(config.url)
    return url.host || config.url
  } catch {
    return config.url
  }
}

export function normalizeSavedGateway(config: GatewayConfig): SavedGateway {
  return {
    id: gatewayIdFromConfig(config),
    name: gatewayNameFromConfig(config),
    url: config.url,
    token: config.token,
  }
}

export function loadGateways(): SavedGateway[] {
  const gateways: SavedGateway[] = []

  try {
    const raw = localStorage.getItem(GATEWAYS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.url === 'string' &&
            typeof item.token === 'string'
          ) {
            gateways.push({
              id: item.id,
              name: item.name,
              url: item.url,
              token: item.token,
            })
          }
        }
      }
    }
  } catch {
    return loadConfig() ? [normalizeSavedGateway(loadConfig()!)] : []
  }

  const active = loadConfig()
  if (active) {
    const normalized = normalizeSavedGateway(active)
    if (!gateways.some((g) => g.id === normalized.id)) {
      gateways.unshift(normalized)
    }
  }

  return gateways
}

export function saveGateways(gateways: SavedGateway[]): void {
  localStorage.setItem(GATEWAYS_STORAGE_KEY, JSON.stringify(gateways))
}

export function saveGateway(config: GatewayConfig): SavedGateway {
  const saved = normalizeSavedGateway(config)
  const next = [
    saved,
    ...loadGateways().filter((gateway) => gateway.id !== saved.id),
  ]
  saveGateways(next)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  return saved
}

export function deleteGateway(id: string): SavedGateway[] {
  const next = loadGateways().filter((gateway) => gateway.id !== id)
  saveGateways(next)
  const active = loadConfig()
  if (active && gatewayIdFromConfig(active) === id) {
    clearConfig()
  }
  return next
}
