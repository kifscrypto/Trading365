import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.bybit.com'
const PATH = '/v5/user/aff-customer-info'
const RECV_WINDOW = '5000'
const PAGE_SIZE = 100

// Affiliate customer list, paginated by cursor. Requires an affiliate API key
// with only the "affiliate" permission ticked. Without startDate/endDate each
// user carries commissions30Day/commissions365Day as per-coin string maps; we
// sum the 365-day figures (the broadest window the endpoint returns) into a
// per-currency total and count listed users as referrals.
export const bybit: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for bybit')

  const totals = new Map<string, number>()
  let referrals = 0
  let cursor: string | null = null
  let pages = 0

  do {
    const params = new URLSearchParams({ size: String(PAGE_SIZE) })
    if (cursor) params.set('cursor', cursor)
    const query = params.toString()
    const timestamp = Date.now().toString()
    const sign = hmacSha256Hex(creds.apiSecret, timestamp + creds.apiKey + RECV_WINDOW + query)

    const res = await fetch(`${BASE}${PATH}?${query}`, {
      headers: {
        'X-BAPI-API-KEY': creds.apiKey,
        'X-BAPI-SIGN': sign,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || body?.retCode !== 0) {
      throw new Error(`Bybit ${res.status}: ${body?.retMsg ?? 'request failed'} (retCode ${body?.retCode ?? '?'})`)
    }

    const list = body.result?.list ?? []
    pages += 1
    referrals += list.length
    for (const user of list) {
      const commissions = user.commissions365Day ?? {}
      for (const [coin, amount] of Object.entries(commissions)) {
        const n = Number(amount)
        if (!n) continue
        totals.set(coin, (totals.get(coin) ?? 0) + n)
      }
    }
    cursor = body.result?.nextPageCursor || null
  } while (cursor)

  const breakdown = []
  let totalUsd = 0
  for (const [currency, amount] of totals) {
    const { usd } = await toUsd(amount, currency)
    breakdown.push({ currency, amount: +amount.toFixed(8), usd })
    totalUsd += usd
  }
  breakdown.sort((a, b) => b.usd - a.usd)

  return {
    totalUsd: +totalUsd.toFixed(2),
    referrals,
    breakdown,
    raw: { pages, perCoin: Object.fromEntries(totals) },
  }
}
