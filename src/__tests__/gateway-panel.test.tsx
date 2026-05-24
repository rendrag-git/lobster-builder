import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayPanel } from '../app/GatewayPanel'
import { useGatewayStore } from '../store/gateway-store'
import { saveGateways } from '../lib/gateway-client'
import type { SavedGateway } from '../lib/gateway-client'

const homeGateway: SavedGateway = {
  id: 'home',
  name: 'Home',
  url: 'http://home:18789',
  token: 'home-token',
}

function resetGatewayStore() {
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

function mockGatewayFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
      if (url.includes('/api/discover')) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) })
      }
      const body = JSON.parse(opts?.body ?? '{}') as { tool: string }
      const result = body.tool === 'agents_list'
        ? { agents: [{ id: 'builder', name: 'Builder' }] }
        : { model: 'test/model' }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result }),
      })
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  resetGatewayStore()
  mockGatewayFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GatewayPanel', () => {
  it('defaults to the same-origin dev proxy instead of a direct localhost gateway', () => {
    render(<GatewayPanel onClose={vi.fn()} />)

    expect(screen.getByTestId('gateway-url-input')).toHaveValue('')
    expect(screen.getByPlaceholderText('Leave blank for local dev proxy')).toBeInTheDocument()
  })

  it('initializes the form from the active saved gateway', () => {
    useGatewayStore.setState({
      config: homeGateway,
      gateways: [homeGateway],
      selectedGatewayId: homeGateway.id,
      status: 'connected',
    })

    render(<GatewayPanel onClose={vi.fn()} />)

    expect(screen.getByTestId('gateway-name-input')).toHaveValue('Home')
    expect(screen.getByTestId('gateway-url-input')).toHaveValue('http://home:18789')
    expect(screen.getByTestId('gateway-token-input')).toHaveValue('home-token')
  })

  it('creates a new gateway from edited fields instead of overwriting the selected gateway id', async () => {
    const user = userEvent.setup()
    saveGateways([homeGateway])
    useGatewayStore.setState({
      config: homeGateway,
      gateways: [homeGateway],
      selectedGatewayId: homeGateway.id,
      status: 'connected',
    })

    render(<GatewayPanel onClose={vi.fn()} />)

    await user.clear(screen.getByTestId('gateway-name-input'))
    await user.type(screen.getByTestId('gateway-name-input'), 'Rescue')
    await user.clear(screen.getByTestId('gateway-url-input'))
    await user.type(screen.getByTestId('gateway-url-input'), 'http://rescue:18789')
    await user.clear(screen.getByTestId('gateway-token-input'))
    await user.type(screen.getByTestId('gateway-token-input'), 'rescue-token')
    await user.click(screen.getByTestId('gateway-connect-btn'))

    await waitFor(() => expect(useGatewayStore.getState().status).toBe('connected'))

    const gateways = useGatewayStore.getState().gateways
    expect(gateways).toEqual(
      expect.arrayContaining([
        expect.objectContaining(homeGateway),
        expect.objectContaining({
          id: 'gateway:http://rescue:18789',
          name: 'Rescue',
          url: 'http://rescue:18789',
          token: 'rescue-token',
        }),
      ]),
    )
  })
})
