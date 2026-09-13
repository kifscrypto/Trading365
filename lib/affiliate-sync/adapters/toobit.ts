import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.toobit.com'
const COMMISSION_PATH = '/api/v1/agent/commissionDataInfo'
const INVITEES_PATH = '/api/v1/agent/inviteUserList'
const PAGE_SIZE = 200
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000

// Binance-style signing: lowercase hex HMAC-SHA256(secret, queryString), sent as
// the trailing &signature= param, API key in X-BB-APIKEY. The signed query string
// must be sent to the server in the exact parameter order it was signed in.
async function signedGet(apiKey: string, apiSecret: string, path: string, params: URLSearchParams) {
  params.set('timestamp', Date.now().toString())
  const query = params.toString()
  const signature = hmacSha256Hex(apiSecret, query)
  const res = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    headers: { 'X-BB-APIKEY': apiKey },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.code !== 200) {
    throw new Error(`Toobit ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }
  return body.data
}

// Commission summary per invited user; amounts are already denominated in USDT.
// Each request covers at most 30 days and only the last 365 days are available,
// so we slide 30-day windows back a year and paginate each window. Referrals
// come from the invitee list's total count.
export const toobit: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for toobit')

  let commission = 0
  let windows = 0
  let pages = 0
  const now = Date.now()

  for (let end = now; end > now - LOOKBACK_MS; end -= WINDOW_MS) {
    const start = Math.max(end - WINDOW_MS, now - LOOKBACK_MS)
    windows += 1
    let pageIndex = 1
    let totalPages = 1

    while (pageIndex <= totalPages) {
      const data = await signedGet(creds.apiKey, creds.apiSecret, COMMISSION_PATH, new URLSearchParams({
        pageIndex: String(pageIndex),
        pageSize: String(PAGE_SIZE),
        startTime: String(start),
        endTime: String(end),
      }))
      pages += 1
      totalPages = Number(data?.pages) || 1
      for (const row of data?.list ?? []) {
        commission += Number(row.commissionVolume) || 0
      }
      pageIndex += 1
    }
  }

  const invitees = await signedGet(creds.apiKey, creds.apiSecret, INVITEES_PATH, new URLSearchParams({
    pageIndex: '1',
    pageSize: '100',
  }))
  const referrals = Number(invitees?.total) || undefined

  const { usd } = await toUsd(commission, 'USDT')

  return {
    totalUsd: +usd.toFixed(2),
    referrals,
    breakdown: [{ currency: 'USDT', amount: +commission.toFixed(8), usd }],
    raw: { windows, pages, commissionUsdt: +commission.toFixed(8) },
  }
}
