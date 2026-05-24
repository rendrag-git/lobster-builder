import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'

type StoredIdentity = {
  version: 1
  deviceId: string
  publicKey: string
  privateKey: string
  createdAtMs: number
}

export type OpenClawDeviceIdentity = {
  deviceId: string
  publicKey: string
  privateKey: string
}

export type OpenClawDeviceAuthEntry = {
  token: string
  role: string
  scopes: string[]
  updatedAtMs: number
}

type DeviceAuthStore = {
  version: 1
  deviceId: string
  tokens: Record<string, OpenClawDeviceAuthEntry>
}

const DEVICE_IDENTITY_STORAGE_KEY = 'openclaw-device-identity-v1'
const DEVICE_AUTH_STORAGE_KEY = 'openclaw.device.auth.v1'

function readLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.slice().buffer as ArrayBuffer)
  return bytesToHex(new Uint8Array(hash))
}

async function generateIdentity(): Promise<OpenClawDeviceIdentity> {
  const privateKey = utils.randomSecretKey()
  const publicKey = await getPublicKeyAsync(privateKey)
  const deviceId = await fingerprintPublicKey(publicKey)
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  }
}

export async function loadOrCreateOpenClawDeviceIdentity(): Promise<OpenClawDeviceIdentity | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null
  }

  const storage = readLocalStorage()
  try {
    const raw = storage?.getItem(DEVICE_IDENTITY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKey === 'string' &&
        typeof parsed.privateKey === 'string'
      ) {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey))
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = { ...parsed, deviceId: derivedId }
          storage?.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(updated))
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          }
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        }
      }
    }
  } catch {
    // fall through to regenerate
  }

  const identity = await generateIdentity()
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  }
  storage?.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(stored))
  return identity
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase() || 'operator'
}

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return []
  const out = new Set<string>()
  for (const scope of scopes) {
    if (typeof scope === 'string' && scope.trim()) {
      out.add(scope.trim())
    }
  }
  return [...out]
}

function readDeviceAuthStore(): DeviceAuthStore | null {
  try {
    const raw = readLocalStorage()?.getItem(DEVICE_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DeviceAuthStore
    if (
      parsed?.version !== 1 ||
      typeof parsed.deviceId !== 'string' ||
      !parsed.tokens ||
      typeof parsed.tokens !== 'object' ||
      Array.isArray(parsed.tokens)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeDeviceAuthStore(store: DeviceAuthStore): void {
  try {
    readLocalStorage()?.setItem(DEVICE_AUTH_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // best-effort
  }
}

export function loadOpenClawDeviceAuthToken(params: {
  deviceId: string
  role: string
}): OpenClawDeviceAuthEntry | null {
  const store = readDeviceAuthStore()
  if (!store || store.deviceId !== params.deviceId) return null
  const role = normalizeRole(params.role)
  const entry = store.tokens[role]
  if (!entry || typeof entry.token !== 'string') return null
  return {
    token: entry.token,
    role,
    scopes: normalizeScopes(entry.scopes),
    updatedAtMs: typeof entry.updatedAtMs === 'number' ? entry.updatedAtMs : 0,
  }
}

export function storeOpenClawDeviceAuthToken(params: {
  deviceId: string
  role: string
  token: string
  scopes?: string[]
}): OpenClawDeviceAuthEntry {
  const role = normalizeRole(params.role)
  const existing = readDeviceAuthStore()
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      existing && existing.deviceId === params.deviceId && existing.tokens
        ? { ...existing.tokens }
        : {},
  }
  const entry: OpenClawDeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  }
  next.tokens[role] = entry
  writeDeviceAuthStore(next)
  return entry
}

export function buildOpenClawDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string | null
  nonce: string
}): string {
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
  ].join('|')
}

export async function signOpenClawDevicePayload(
  privateKeyBase64Url: string,
  payload: string,
): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url)
  const data = new TextEncoder().encode(payload)
  const sig = await signAsync(data, key)
  return base64UrlEncode(sig)
}
