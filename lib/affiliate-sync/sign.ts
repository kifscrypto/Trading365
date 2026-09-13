import { createHmac } from 'node:crypto'

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function hmacSha256Base64(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64')
}
