import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://open-api.bingx.com'
const COMMISSION_PATH = '/openApi/agent/v2/reward/commissionDataList'
const INVITEES_PATH = '/openApi/agent/v1/account/inviteAccountList'
const PAGE_SIZE = 100
const WINDOW_DAYS = 30
const LOOKBACK_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Signed GET. BingX signs the query string (all params incl. timestamp, keys
// sorted alphabetically) with HMAC-SHA256 hex, appended as &signature=.
async function bingxGet(creds: { apiKey: string; apiSecret: string }, path: string, params: Record<string, string>) {
  const all: Record<string, string> = { ...params, timestamp: Date.now().toString() }
  const query = Object.keys(all)
    .sort()
    .map((k) => `${k}=${all[k]}`)
    .join('&')
  const signature = hmacSha256Hex(creds.apiSecret, query)

  const res = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    headers: { 'X-BX-APIKEY': creds.apiKey },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.code !== 0) {
    throw new Error(`BingX ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }
  return body.data
}

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

// Daily commission per invitee, max 30-day windows over a sliding 365-day
// range. commissionVolume is already denominated in USDT, so we sum it into a
// single USDT total. Referral count comes from the inviteAccountList total.
export const bingx: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for bingx')
  const auth = { apiKey: creds.apiKey, apiSecret: creds.apiSecret }

  let totalUsdt = 0
  let records = 0
  let windows = 0
  let requests = 0

  const now = Date.now()
  let windowEnd = new Date(now)
  const cutoff = now - LOOKBACK_DAYS * DAY_MS

  while (windowEnd.getTime() > cutoff) {
    const windowStart = new Date(Math.max(cutoff, windowEnd.getTime() - (WINDOW_DAYS - 1) * DAY_MS))
    const range = { startTime: yyyymmdd(windowStart), endTime: yyyymmdd(windowEnd) }

    let pageIndex = 1
    for (;;) {
      if (requests > 0) await sleep(400) // per-IP limit is 2/s
      requests += 1
      const data = await bingxGet(auth, COMMISSION_PATH, {
        ...range,
        pageIndex: String(pageIndex),
        pageSize: String(PAGE_SIZE),
      })
      const list = data?.list ?? []
      for (const row of list) {
        const n = Number(row.commissionVolume)
        if (n) totalUsdt += n
      }
      records += list.length
      const total = Number(data?.total ?? 0)
      if (!list.length || pageIndex * PAGE_SIZE >= total) break
      pageIndex += 1
    }

    windows += 1
    windowEnd = new Date(windowStart.getTime() - DAY_MS)
  }

  await sleep(400)
  const invitees = await bingxGet(auth, INVITEES_PATH, { pageIndex: '1', pageSize: '1' })
  const referrals = Number(invitees?.total ?? 0) || undefined

  const { usd } = await toUsd(totalUsdt, 'USDT')

  return {
    totalUsd: +usd.toFixed(2),
    referrals,
    breakdown: [{ currency: 'USDT', amount: +totalUsdt.toFixed(8), usd }],
    raw: { windows, records, days: LOOKBACK_DAYS },
  }
}
