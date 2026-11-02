import { verify } from 'node:crypto'
import type { AppState, LicensePayload, LicenseState } from '../shared/types'
import { DESK_PUBLIC_KEY as CONFIGURED_PUBLIC_KEY } from './license-public-key'

export const DESK_PUBLIC_KEY = process.env.DESK_PUBLIC_KEY ?? CONFIGURED_PUBLIC_KEY
export const TRIAL_DAYS = 7

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce((result, key) => {
      result[key] = canonical((value as Record<string, unknown>)[key])
      return result
    }, {} as Record<string, unknown>)
  }
  return value
}

export function canonicalPayload(payload: LicensePayload): string {
  return JSON.stringify(canonical(payload))
}

export function verifyLicenseKey(key: string, publicKeyPem = DESK_PUBLIC_KEY): LicensePayload {
  if (!publicKeyPem.trim()) throw new Error('This build has no licence public key configured.')
  if (!key || key.length > 16_384) throw new Error('The licence key is not valid.')
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'T365D1') throw new Error('The licence key must use the T365D1 format.')
  let payload: LicensePayload
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as LicensePayload }
  catch { throw new Error('The licence payload could not be read.') }
  if (!payload || typeof payload !== 'object') throw new Error('The licence payload is not valid.')
  if (payload.product !== 't365-desk' || payload.majorVersion < 1) throw new Error('This licence is for a different product.')
  if (!payload.licenseId || !payload.orderId || !Date.parse(payload.issuedAt) || !Date.parse(payload.updatesUntil)) {
    throw new Error('The licence is missing required identifiers or dates.')
  }
  if (Date.parse(payload.updatesUntil) < Date.parse(payload.issuedAt)) throw new Error('The licence update entitlement is not valid.')
  const signature = Buffer.from(parts[2], 'base64url')
  if (!verify(null, Buffer.from(canonicalPayload(payload)), publicKeyPem, signature)) throw new Error('The licence signature is not valid.')
  return payload
}

export function licenseState(state: AppState, now = Date.now(), publicKeyPem = DESK_PUBLIC_KEY): LicenseState {
  const started = Date.parse(state.trialStartedAt) || now
  const trialEndsAt = new Date(started + TRIAL_DAYS * 864e5).toISOString()
  if (state.licenseRecord) {
    return { status: 'active', licenseId: state.licenseRecord.licenseId, updatesUntil: state.licenseRecord.updatesUntil, trialStartedAt: state.trialStartedAt, trialEndsAt }
  }
  const expired = now >= started + TRIAL_DAYS * 864e5
  return {
    status: expired ? 'expired' : publicKeyPem.trim() ? 'trial' : 'unconfigured',
    licenseId: null,
    updatesUntil: null,
    trialStartedAt: state.trialStartedAt,
    trialEndsAt,
  }
}
