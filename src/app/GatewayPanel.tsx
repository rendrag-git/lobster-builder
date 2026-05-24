import { useState } from 'react'
import { X, RefreshCw, Wifi, WifiOff, Eye, EyeOff, Trash2, CircleHelp } from 'lucide-react'
import { useGatewayStore } from '../store/gateway-store'
import type { SavedGateway } from '../store/gateway-store'
import { Tooltip } from '../components/Tooltip'

interface GatewayPanelProps {
  onClose: () => void
}

function formatRelativeTime(ts: number | null): string {
  if (ts === null) return 'never'
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  return `${Math.floor(diffMin / 60)}h ago`
}

export function GatewayPanel({ onClose }: GatewayPanelProps) {
  const { status, discovery, lastError, lastRefresh, gateways, selectedGatewayId, config, connect, selectGateway, removeGateway, disconnect, refresh } =
    useGatewayStore()

  const initialGateway = gateways.find((gateway) => gateway.id === selectedGatewayId) ?? config ?? null
  const [name, setName] = useState(initialGateway?.name ?? '')
  const [url, setUrl] = useState(initialGateway?.url ?? '')
  const [token, setToken] = useState(initialGateway?.token ?? '')
  const [sourceGatewayId, setSourceGatewayId] = useState(initialGateway?.id ?? null)
  const [showToken, setShowToken] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const sourceGateway = sourceGatewayId
    ? gateways.find((gateway) => gateway.id === sourceGatewayId)
    : null

  const handleConnect = () => {
    const nextName = name.trim()
    const nextUrl = url.trim()
    const nextToken = token.trim()
    const shouldReuseGatewayId =
      sourceGateway &&
      sourceGateway.name === nextName &&
      sourceGateway.url === nextUrl &&
      sourceGateway.token === nextToken

    connect({
      ...(shouldReuseGatewayId ? { id: sourceGateway.id } : {}),
      name: nextName,
      url: nextUrl,
      token: nextToken,
    })
  }

  const loadGateway = (gateway: SavedGateway) => {
    setName(gateway.name)
    setUrl(gateway.url)
    setToken(gateway.token)
    setSourceGatewayId(gateway.id)
    selectGateway(gateway.id)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refresh()
    setIsRefreshing(false)
  }

  const statusDot: Record<typeof status, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    disconnected: 'bg-gray-600',
  }

  const statusLabel: Record<typeof status, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    error: 'Error',
    disconnected: 'Disconnected',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="gateway-panel">
      <div className="w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
            <Wifi size={14} className="text-gray-400" />
            Gateway Connection
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            data-testid="gateway-close-btn"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* URL */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Gateway Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Home gateway"
              className="w-full px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="gateway-name-input"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <span>Gateway URL</span>
              <Tooltip
                side="bottom-left"
                content="Leave this blank when Builder is served by the local dev server. The browser calls /tools/invoke on this origin and Vite proxies to the OpenClaw gateway. Only enter a full URL when that gateway allows browser CORS."
              >
                <CircleHelp size={12} className="text-gray-600" aria-hidden="true" />
              </Tooltip>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Leave blank for local dev proxy"
              className="w-full px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="gateway-url-input"
            />
          </div>

          {/* Token */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bearer Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-2 py-1.5 pr-8 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                data-testid="gateway-token-input"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>

          {gateways.length > 0 && (
            <div className="pt-1 border-t border-gray-800 space-y-1">
              <p className="text-gray-500 font-medium text-xs">Saved gateways</p>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {gateways.map((gateway) => (
                  <div key={gateway.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => loadGateway(gateway)}
                      className={`flex-1 min-w-0 text-left px-2 py-1 rounded text-xs transition-colors ${
                        selectedGatewayId === gateway.id
                          ? 'bg-blue-950/50 text-blue-200'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                    >
                      <span className="block truncate">{gateway.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGateway(gateway.id)}
                      title={`Remove ${gateway.name}`}
                      className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={status === 'connecting'}
              className="flex-1 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white transition-colors"
              data-testid="gateway-connect-btn"
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
            {(status === 'connected' || status === 'error') && (
              <button
                onClick={disconnect}
                className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Status */}
          <div className="pt-1 border-t border-gray-800 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[status]}`} />
              <span className="text-xs text-gray-300">{statusLabel[status]}</span>
              {status === 'connected' ? (
                <Wifi size={11} className="text-green-400 ml-auto" />
              ) : (
                <WifiOff size={11} className="text-gray-600 ml-auto" />
              )}
            </div>

            {/* Error */}
            {lastError && (
              <p className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">{lastError}</p>
            )}

            {/* Refresh */}
            {status === 'connected' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  Refreshed {formatRelativeTime(lastRefresh)}
                </span>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            )}
          </div>

          {/* Discovery summary */}
          <div className="text-xs text-gray-400 space-y-1">
            <p className="text-gray-500 font-medium">Discovered:</p>
            {discovery ? (
              <>
                <p>
                  {discovery.agents.length} agent{discovery.agents.length !== 1 ? 's' : ''} ·{' '}
                  {discovery.models.length} model{discovery.models.length !== 1 ? 's' : ''}
                </p>
                <p>
                  {discovery.channels.length} channel{discovery.channels.length !== 1 ? 's' : ''}{' '}
                  · {discovery.skills.length} skill{discovery.skills.length !== 1 ? 's' : ''}
                </p>
                <p className="text-gray-600 italic text-[10px]">
                  Full catalog (channels, skills, tools) requires Gateway /api/discover (Phase 2)
                </p>
              </>
            ) : (
              <p className="text-gray-600">(connect to discover)</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
