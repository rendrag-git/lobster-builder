import { describe, expect, it } from 'vitest'
import {
  gatewayActionErrorLabel,
  gatewayActionErrorTitle,
  isGatewayBrowserAuthError,
  isGatewayBrowserPairingError,
  isGatewayTokenMissingError,
} from '../lib/gateway-errors'

describe('gateway error copy', () => {
  it('classifies pairing errors as browser authorization', () => {
    expect(isGatewayBrowserAuthError('NOT_PAIRED: pairing required')).toBe(true)
    expect(isGatewayBrowserPairingError('NOT_PAIRED: pairing required')).toBe(true)
    expect(isGatewayTokenMissingError('NOT_PAIRED: pairing required')).toBe(false)
    expect(gatewayActionErrorLabel('NOT_PAIRED: pairing required')).toBe('Authorize browser')
  })

  it('distinguishes hosted token-missing errors from pairing approval', () => {
    const error = 'INVALID_REQUEST: unauthorized: gateway token missing'

    expect(isGatewayBrowserAuthError(error)).toBe(true)
    expect(isGatewayBrowserPairingError(error)).toBe(false)
    expect(isGatewayTokenMissingError(error)).toBe(true)
    expect(gatewayActionErrorLabel(error)).toBe('Gateway token needed')
    expect(gatewayActionErrorTitle(error)).toMatch(/opened without gateway auth/)
  })

  it('leaves ordinary gateway failures as deploy failures', () => {
    expect(isGatewayBrowserAuthError('Workflow validation failed')).toBe(false)
    expect(gatewayActionErrorLabel('Workflow validation failed')).toBe('Deploy failed')
    expect(gatewayActionErrorTitle('Workflow validation failed')).toBe('Workflow validation failed')
  })
})
