import { create } from 'zustand'
import {
  discover,
  loadConfig,
  loadHostedGatewayConfig,
  loadGateways,
  normalizeSavedGateway,
  saveConfig,
  saveGateway,
  deleteGateway,
  clearConfig,
} from '../lib/gateway-client'
import type { GatewayConfig, SavedGateway, DiscoveryData, ConnectionStatus } from '../lib/gateway-client'
import type { ConfigFieldOption } from '../types/actions'
import type { WorkflowMeta } from '../types/graph'

export type { GatewayConfig, SavedGateway, DiscoveryData, ConnectionStatus }

interface GatewayState {
  config: GatewayConfig | null
  gateways: SavedGateway[]
  selectedGatewayId: string | null
  status: ConnectionStatus
  discovery: DiscoveryData | null
  lastError: string | null
  lastRefresh: number | null

  connect: (config: GatewayConfig) => Promise<void>
  selectGateway: (id: string) => Promise<void>
  removeGateway: (id: string) => void
  disconnect: () => void
  refresh: () => Promise<void>
  init: () => void
}

let connectGeneration = 0

export const useGatewayStore = create<GatewayState>((set, get) => ({
  config: null,
  gateways: loadGateways(),
  selectedGatewayId: null,
  status: 'disconnected',
  discovery: null,
  lastError: null,
  lastRefresh: null,

  connect: async (config) => {
    const generation = ++connectGeneration
    set({ status: 'connecting', lastError: null })
    const shouldPersist = config.persist !== false
    const saved = shouldPersist
      ? saveGateway(config)
      : { ...normalizeSavedGateway(config), persist: false }
    try {
      const discovery = await discover(saved)
      if (generation !== connectGeneration) return
      set({
        config: saved,
        gateways: loadGateways(),
        selectedGatewayId: saved.id,
        status: 'connected',
        discovery,
        lastRefresh: Date.now(),
        lastError: null,
      })
    } catch (err) {
      if (generation !== connectGeneration) return
      set({
        config: saved,
        gateways: loadGateways(),
        selectedGatewayId: saved.id,
        status: 'error',
        discovery: null,
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  selectGateway: async (id) => {
    const gateway = get().gateways.find((g) => g.id === id)
    if (!gateway) {
      set({ lastError: `Unknown gateway: ${id}`, status: 'error' })
      return
    }
    saveConfig(gateway)
    await get().connect(gateway)
  },

  removeGateway: (id) => {
    const next = deleteGateway(id)
    const active = get().config
    if (active?.id === id || (!active?.id && active?.url && `gateway:${active.url}` === id)) {
      connectGeneration += 1
      set({
        gateways: next,
        selectedGatewayId: null,
        status: 'disconnected',
        config: null,
        discovery: null,
        lastError: null,
        lastRefresh: null,
      })
      return
    }
    set({ gateways: next })
  },

  disconnect: () => {
    connectGeneration += 1
    clearConfig()
    set({ status: 'disconnected', config: null, selectedGatewayId: null, discovery: null, lastError: null, lastRefresh: null })
  },

  refresh: async () => {
    const { config } = get()
    if (!config) return
    try {
      const discovery = await discover(config)
      set({ discovery, lastRefresh: Date.now(), lastError: null, status: 'connected' })
    } catch (err) {
      set({
        status: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  init: () => {
    const hostedConfig = loadHostedGatewayConfig()
    const savedConfig = loadConfig()
    const config = hostedConfig ?? savedConfig
    set({ gateways: loadGateways(), selectedGatewayId: config?.id ?? null })
    if (config) {
      get().connect(config)
    } else {
      connectGeneration += 1
    }
  },
}))

export function resolveWorkflowGatewayConfig(
  meta: WorkflowMeta,
  gateways: SavedGateway[],
  fallback: GatewayConfig | null,
): GatewayConfig | null {
  const gatewayId = meta.gateway?.id?.trim()
  if (gatewayId) {
    return gateways.find((gateway) => gateway.id === gatewayId) ?? null
  }
  return fallback
}

// Pure function: maps discovery data into ConfigFieldOption arrays.
// Testable without React context. Returns null when not connected or no source.
export function resolveGatewayOptions(
  source: keyof DiscoveryData | null | undefined,
  discovery: DiscoveryData | null,
  status: ConnectionStatus,
): ConfigFieldOption[] | null {
  if (!source || status !== 'connected' || !discovery) return null

  const data = discovery[source]
  if (!Array.isArray(data)) return null

  switch (source) {
    case 'agents':
      return (data as DiscoveryData['agents']).map((a) => ({
        label: a.name || a.id,
        value: a.id,
      }))
    case 'models':
      return (data as DiscoveryData['models']).map((m) => ({
        label: m.alias || m.id,
        value: m.alias || m.id,
      }))
    case 'channels':
      return (data as DiscoveryData['channels'])
        .filter((c) => c.enabled)
        .map((c) => ({ label: c.id, value: c.id }))
    case 'channelTargets':
      return (data as NonNullable<DiscoveryData['channelTargets']>).map((target) => ({
        label: target.label ?? target.id,
        value: target.id,
      }))
    case 'skills':
      return (data as DiscoveryData['skills']).map((s) => ({
        label: s.name,
        value: s.id,
      }))
    case 'tools':
      return (data as DiscoveryData['tools']).map((t) => ({
        label: t,
        value: t,
      }))
    case 'nodes':
      return (data as NonNullable<DiscoveryData['nodes']>).map((n) => ({
        label: n.name || n.id,
        value: n.id,
      }))
    default:
      return null
  }
}

// React hook: reads from store and delegates to resolveGatewayOptions.
// Use in React components — triggers re-render on store changes.
export function useGatewayOptions(
  source: keyof DiscoveryData | null | undefined,
): ConfigFieldOption[] | null {
  const { status, discovery } = useGatewayStore()
  return resolveGatewayOptions(source, discovery, status)
}
