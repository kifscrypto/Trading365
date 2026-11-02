import { sign } from 'node:crypto'
import { DESK_PRODUCT } from './desk'

export interface DesktopLicensePayload {
  licenseId: string
  orderId: string
  product: 't365-desk'
  majorVersion: 1
  issuedAt: string
  updatesUntil: string
}

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

export function canonicalDesktopPayload(payload: DesktopLicensePayload): string {
  return JSON.stringify(canonical(payload))
}

export function createDesktopLicenseKey(payload: DesktopLicensePayload, privateKeyPem: string): string {
  if (!privateKeyPem.trim()) throw new Error('Desktop licence signing is not configured.')
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(null, Buffer.from(canonicalDesktopPayload(payload)), privateKeyPem.replace(/\\n/g, '\n')).toString('base64url')
  return `T365D1.${encoded}.${signature}`
}

export function signDesktopLicense(orderId: string, now = new Date()): { key: string; payload: DesktopLicensePayload } {
  const privateKey = process.env.DESKTOP_LICENSE_PRIVATE_KEY
  if (!privateKey) throw new Error('DESKTOP_LICENSE_PRIVATE_KEY is not configured.')
  const issuedAt = now.toISOString()
  const updatesUntil = new Date(now.getTime() + DESK_PRODUCT.updateDays * 864e5).toISOString()
  const payload: DesktopLicensePayload = {
    licenseId: `T365D-${orderId}`,
    orderId,
    product: DESK_PRODUCT.product,
    majorVersion: DESK_PRODUCT.majorVersion,
    issuedAt,
    updatesUntil,
  }
  return { key: createDesktopLicenseKey(payload, privateKey), payload }
}
