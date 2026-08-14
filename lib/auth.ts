// Admin session tokens: HMAC-SHA256 signed, expiring. Edge-runtime safe — uses
// only Web Crypto (crypto.subtle) and globals available in both Edge and
// Node 22+, so this module can be imported from middleware.ts.
//
// Token format: <payloadB64url>.<sigB64url>
//   payload = JSON { "exp": <epoch ms> }
//   sig     = HMAC-SHA256(payloadB64url, key derived from ADMIN_SESSION_SECRET)
//
// Fails closed: if ADMIN_SESSION_SECRET is unset, nothing ever verifies.

const COOKIE_NAME = 'admin_auth'

export const SESSION_TTL = 60 * 60 * 12 // seconds (12h) — also the cookie maxAge
const SESSION_TTL_MS = SESSION_TTL * 1000

let cachedKey: Promise<CryptoKey> | null = null
let loggedMissingSecret = false

function getSecret(): string | undefined {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret && !loggedMissingSecret) {
    loggedMissingSecret = true
    console.error(
      'ADMIN_SESSION_SECRET env var is not set — all admin session verification fails closed'
    )
  }
  return secret
}

async function getKey(): Promise<CryptoKey | null> {
  const secret = getSecret()
  if (!secret) return null
  if (!cachedKey) {
    cachedKey = crypto.subtle
      .importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ])
      .catch((err) => {
        cachedKey = null
        throw err
      })
  }
  return cachedKey
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export async function mintAdminToken(): Promise<string> {
  const key = await getKey()
  if (!key) throw new Error('ADMIN_SESSION_SECRET is not set')
  const payloadB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }))
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`
}

// Constant-time signature check via crypto.subtle.verify, then expiry.
// Any malformed input returns false — this never throws.
export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  try {
    if (!token) return false
    const key = await getKey()
    if (!key) return false

    const dot = token.indexOf('.')
    if (dot <= 0 || dot === token.length - 1) return false
    const payloadB64 = token.slice(0, dot)
    const sig = b64urlDecode(token.slice(dot + 1))
    if (!sig) return false

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sig as BufferSource,
      new TextEncoder().encode(payloadB64)
    )
    if (!valid) return false

    const payloadBytes = b64urlDecode(payloadB64)
    if (!payloadBytes) return false
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { exp?: unknown }
    if (typeof payload.exp !== 'number') return false
    return payload.exp > Date.now()
  } catch {
    return false
  }
}

// Manual cookie parsing — works identically in middleware and route handlers.
function readAdminCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return undefined
}

export async function verifyAdmin(request: Request): Promise<boolean> {
  return verifyAdminToken(readAdminCookie(request))
}
