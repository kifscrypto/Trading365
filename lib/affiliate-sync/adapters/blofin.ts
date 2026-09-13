import { randomUUID } from 'node:crypto'
import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://openapi.blofin.com'
const PATH = '/api/v1/affiliate/basic'

// Affiliate summary endpoint. data.totalCommission is the cumulative commission
// from all-level invitees (docs say it updates every 6 hours) — the same figure
// the affiliate dashboard shows as total earnings. BloFin settles commissions in
// USDT, so no per-currency split is needed. Signing: prehash =
// path + method + timestamp + nonce + body, HMAC-SHA256 hex digest, then the hex
// string itself (as bytes, not decoded) is Base64-encoded into ACCESS-SIGN.
export const blofin: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for blofin')
  if (!creds.passphrase) throw new Error('passphrase is required for blofin')

  const timestamp = Date.now().toString()
  const nonce = randomUUID()
  const sign = Buffer.from(hmacSha256Hex(creds.apiSecret, PATH + 'GET' + timestamp + nonce), 'utf8').toString('base64')

  const res = await fetch(`${BASE}${PATH}`, {
    headers: {
      'ACCESS-KEY': creds.apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-NONCE': nonce,
      'ACCESS-PASSPHRASE': creds.passphrase,
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  const code = Number(body?.code)
  if (!res.ok || (code !== 0 && code !== 200)) {
    throw new Error(`BloFin ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }

  const data = body.data ?? {}
  const amount = Number(data.totalCommission ?? 0)
  const referrals = Number(data.directInvitees ?? 0) || undefined
  const { usd } = await toUsd(amount, 'USDT')

  return {
    totalUsd: usd,
    referrals,
    breakdown: [{ currency: 'USDT', amount: +amount.toFixed(8), usd }],
    raw: {
      totalCommission: data.totalCommission,
      directInvitees: data.directInvitees,
      directCommission30d: data.directCommission30d,
      subCommission30d: data.subCommission30d,
      updateTime: data.updateTime,
    },
  }
}

export default blofin
