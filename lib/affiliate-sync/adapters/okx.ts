import { hmacSha256Base64 } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://www.okx.com'
const PATH = '/api/v5/affiliate/performance/summary'

// Aggregated affiliate performance, periodType=total for lifetime figures.
// Requires an affiliate account API key with read permission. The response
// carries inviteeCnt plus a per-category (SPOT/DERIVATIVE/BSC) commission
// breakdown already denominated in USDT; we sum the categories into a single
// USDT total rather than hitting the paginated invitee list.
export const okx: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for okx')
  if (!creds.passphrase) throw new Error('passphrase is required for okx')

  const query = 'periodType=total'
  const timestamp = new Date().toISOString()
  const sign = hmacSha256Base64(creds.apiSecret, `${timestamp}GET${PATH}?${query}`)

  const res = await fetch(`${BASE}${PATH}?${query}`, {
    headers: {
      'OK-ACCESS-KEY': creds.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': creds.passphrase,
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.code !== '0') {
    throw new Error(`OKX ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }

  const summary = body.data?.[0] ?? {}
  const details: { commissionCategory?: string; commission?: string }[] = summary.details ?? []
  let amount = 0
  for (const d of details) amount += Number(d.commission) || 0

  const { usd } = await toUsd(amount, 'USDT')

  return {
    totalUsd: +usd.toFixed(2),
    referrals: Number(summary.inviteeCnt) || 0,
    breakdown: [{ currency: 'USDT', amount: +amount.toFixed(8), usd }],
    raw: {
      uTime: summary.uTime,
      inviteeCnt: summary.inviteeCnt,
      perCategory: Object.fromEntries(details.map((d) => [d.commissionCategory, d.commission])),
    },
  }
}
