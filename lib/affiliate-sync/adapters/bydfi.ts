import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.bydfi.com/api'
const PATH = '/v1/agent/teams'

// KOL team overview. Requires an affiliate (agent) API key. Signing per
// developers.bydfi.com/en/signature: hex HMAC-SHA256(secret, apiKey +
// timestamp + queryString); queryString is empty here. The response carries
// `commission` = total commission earned; the docs don't state its currency,
// and every other agent endpoint denominates amounts in USDT, so it is
// treated as USDT.
// verify against live account — docs inconclusive on currency of teams.commission (assumed USDT)
export const bydfi: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for bydfi')

  const timestamp = Date.now().toString()
  const sign = hmacSha256Hex(creds.apiSecret, creds.apiKey + timestamp)

  const res = await fetch(`${BASE}${PATH}`, {
    headers: {
      'X-API-KEY': creds.apiKey,
      'X-API-TIMESTAMP': timestamp,
      'X-API-SIGNATURE': sign,
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || String(body?.code) !== '200') {
    throw new Error(`BYDFi ${res.status}: ${body?.message ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }

  const data = body?.data ?? body ?? {}
  const commission = Number(data.commission ?? 0)
  const referrals = Number(data.regularUsers ?? 0) + Number(data.agentUsers ?? 0)

  const breakdown = []
  let totalUsd = 0
  if (commission) {
    const { usd } = await toUsd(commission, 'USDT')
    breakdown.push({ currency: 'USDT', amount: +commission.toFixed(8), usd })
    totalUsd += usd
  }

  return {
    totalUsd: +totalUsd.toFixed(2),
    referrals,
    breakdown,
    raw: {
      commission: data.commission,
      regularUsers: data.regularUsers,
      agentUsers: data.agentUsers,
      tradeUsers: data.tradeUsers,
      updateTime: data.updateTime,
    },
  }
}
