import { create } from 'zustand'
import {
  discover,
  loadConfig,
  saveConfig,
  clearConfig,
} from '../lib/gateway-client'
import type { GatewayConfig, DiscoveryData, ConnectionStatus } from '../lib/gateway-client'
import type { ConfigFieldOption } from '../types/actions'

export type { GatewayConfig, DiscoveryData, ConnectionStatus }

interface GatewayState {
  config: GatewayConfig | null
  status: ConnectionStatus
  discovery: DiscoveryData | null
  lastError: string | null
  lastRefresh: number | null

  connect: (config: GatewayConfig) => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
  init: () => void
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  config: null,
  status: 'disconnected',
  discovery: null,
  lastError: null,
  lastRefresh: null,

  connect: async (config) => {
    set({ status: 'connecting', lastError: null })
    saveConfig(config)
    try {
      const discovery = await discover(config)
      set({
        config,
        status: 'connected',
        discovery,
        lastRefresh: Date.now(),
        lastError: null,
      })
    } catch (err) {
      set({
        config,
        status: 'error',
        discovery: null,
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  disconnect: () => {
    clearConfig()
    set({ status: 'disconnected', config: null, discovery: null, lastError: null, lastRefresh: null })
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
    const config = loadConfig()
    if (config) {
      get().connect(config)
    }
  },
}))

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
