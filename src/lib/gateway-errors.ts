const BROWSER_PAIRING_ERROR_RE = /NOT_PAIRED|pairing required/i
const GATEWAY_TOKEN_MISSING_RE = /token_missing|gateway token missing/i

export function isGatewayBrowserAuthError(error: string | null): boolean {
  return isGatewayBrowserPairingError(error) || isGatewayTokenMissingError(error)
}

export function isGatewayBrowserPairingError(error: string | null): boolean {
  return Boolean(error && BROWSER_PAIRING_ERROR_RE.test(error))
}

export function isGatewayTokenMissingError(error: string | null): boolean {
  return Boolean(error && GATEWAY_TOKEN_MISSING_RE.test(error))
}

export function gatewayActionErrorLabel(error: string | null): string {
  if (isGatewayBrowserPairingError(error)) return 'Authorize browser'
  if (isGatewayTokenMissingError(error)) return 'Gateway token needed'
  return 'Deploy failed'
}

export function gatewayActionErrorTitle(error: string | null): string {
  if (isGatewayBrowserPairingError(error)) {
    return 'This browser is not approved for gateway write actions. Open the Gateway panel, approve the Lobster Builder browser/device request in OpenClaw, then retry the action.'
  }
  if (isGatewayTokenMissingError(error)) {
    return 'This hosted Builder page was opened without gateway auth. Open it from an OpenClaw dashboard URL that carries gateway auth, or add a manual gateway connection token, then retry the action.'
  }
  return error ?? 'Gateway command failed.'
}
