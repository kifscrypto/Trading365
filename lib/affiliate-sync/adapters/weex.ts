import { hmacSha256Base64 } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter, AdapterCreds } from '../types'

const BASE = 'https://api-spot.weex.com'
const COMMISSION_PATH = '/api/v3/rebate/affiliate/getAffiliateCommission'
const UIDS_PATH = '/api/v3/rebate/affiliate/getAffiliateUIDs'
const PAGE_SIZE = 100
const MS_DAY = 86_400_000
// getAffiliateCommission caps each query at a 3-month range, so the lookback is
// covered by sliding 90-day windows.
const WINDOW_DAYS = 90
const LOOKBACK_DAYS = 360

// V3 signing (docs: weex.com/api-doc, CCXT weex.ts sign()): the string to sign
// is timestamp(ms) + method + requestPath including the query string, and the
// signature is base64 HMAC-SHA256 with the secret.
async function signedGet(creds: AdapterCreds, path: string, params: URLSearchParams) {
  const query = params.toString()
  const endpoint = query ? `${path}?${query}` : path
  const timestamp = Date.now().toString()
  const sign = hmacSha256Base64(creds.apiSecret!, timestamp + 'GET' + endpoint)

  const res = await fetch(`${BASE}${endpoint}`, {
    headers: {
      'ACCESS-KEY': creds.apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-PASSPHRASE': creds.passphrase ?? '',
      'ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  // Errors come back as { code, msg } even on HTTP 200.
  if (!res.ok || body?.msg !== undefined) {
    throw new Error(`WEEX ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }
  return body
}

function windows(): [number, number][] {
  const now = Date.now()
  const from = now - LOOKBACK_DAYS * MS_DAY
  const out: [number, number][] = []
  let end = now
  while (end > from) {
    const start = Math.max(end - WINDOW_DAYS * MS_DAY, from)
    out.push([start, end])
    end = start - 1
  }
  return out
}

// Affiliate commission history, paginated per page over 90-day windows for both
// product types (the endpoint defaults to SPOT only). Commissions are summed
// per coin over the lookback; the invitee count comes from getAffiliateUIDs,
// summing each window's `total` (registrations are disjoint across windows).
export const weex: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for weex')
  if (!creds.passphrase) throw new Error('passphrase is required for weex')

  const totals = new Map<string, number>()
  let pages = 0

  for (const productType of ['SPOT', 'FUTURES']) {
    for (const [startTime, endTime] of windows()) {
      let page = 1
      let totalPages = 1
      while (page <= totalPages) {
        const body = await signedGet(creds, COMMISSION_PATH, new URLSearchParams({
          productType,
          startTime: String(startTime),
          endTime: String(endTime),
          page: String(page),
          pageSize: String(PAGE_SIZE),
        }))
        pages += 1
        totalPages = Number(body?.pages) || 1
        for (const item of body?.channelCommissionInfoItems ?? []) {
          const n = Number(item.commission)
          if (!n || !item.coin) continue
          totals.set(item.coin, (totals.get(item.coin) ?? 0) + n)
        }
        page += 1
      }
    }
  }

  let referrals: number | undefined
  try {
    let count = 0
    for (const [startTime, endTime] of windows()) {
      const body = await signedGet(creds, UIDS_PATH, new URLSearchParams({
        startTime: String(startTime),
        endTime: String(endTime),
        page: '1',
        pageSize: '1',
      }))
      count += Number(body?.total) || 0
    }
    referrals = count
  } catch {
    referrals = undefined
  }

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
    raw: { pages, perCoin: Object.fromEntries(totals), lookbackDays: LOOKBACK_DAYS },
  }
}
