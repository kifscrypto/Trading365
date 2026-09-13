import { createHash, createHmac } from 'node:crypto'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.gateio.ws'
const API_PREFIX = '/api/v4'
const PAGE_SIZE = 100
const WINDOW_SEC = 30 * 24 * 3600 // rebate history range is capped at 30 days
const LOOKBACK_SEC = 365 * 24 * 3600
// SHA-512 hex of an empty body, per Gate v4 signing spec
const EMPTY_BODY_SHA512 = createHash('sha512').update('').digest('hex')

function sign(secret: string, path: string, query: string, timestamp: string): string {
  const payload = ['GET', `${API_PREFIX}${path}`, query, EMPTY_BODY_SHA512, timestamp].join('\n')
  return createHmac('sha512', secret).update(payload).digest('hex')
}

async function gateGet(apiKey: string, apiSecret: string, path: string, query: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const res = await fetch(`${BASE}${API_PREFIX}${path}${query ? `?${query}` : ''}`, {
    headers: {
      KEY: apiKey,
      Timestamp: timestamp,
      SIGN: sign(apiSecret, path, query, timestamp),
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.label) {
    throw new Error(`Gate.io ${res.status} ${path}: ${body?.message ?? 'request failed'} (label ${body?.label ?? '?'})`)
  }
  return body
}

// Gate v4 rebate history, 30-day windows slid back one year, offset pagination.
// Docs: https://www.gate.io/docs/developers/apiv4/en/#partner-obtains-rebate-records-of-recommended-users
// The partner endpoints require partner tier; on auth/tier failure we retry with
// /rebate/agency/commission_history, which returns the same records as a bare
// list. (The suggested /rebate/user/info fallback exposes only the inviter's
// UID — no commission figures — so it cannot produce a total.)
export const gateio: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for gateio')

  const now = Math.floor(Date.now() / 1000)

  const collect = async (path: string) => {
    const totals = new Map<string, number>()
    let records = 0
    let windows = 0
    for (let to = now; to > now - LOOKBACK_SEC; to -= WINDOW_SEC) {
      const from = Math.max(to - WINDOW_SEC, now - LOOKBACK_SEC)
      windows += 1
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const query = new URLSearchParams({
          from: String(from),
          to: String(to),
          limit: String(PAGE_SIZE),
          offset: String(offset),
        }).toString()
        const body = await gateGet(creds.apiKey, creds.apiSecret as string, path, query)
        const list = Array.isArray(body) ? body : body?.list ?? []
        records += list.length
        for (const row of list) {
          const amount = Number(row.commission_amount)
          const asset = row.commission_asset
          if (!amount || !asset) continue
          totals.set(asset, (totals.get(asset) ?? 0) + amount)
        }
        const total = Number(body?.total ?? 0)
        if (list.length < PAGE_SIZE || (total > 0 && offset + list.length >= total)) break
      }
    }
    return { totals, records, windows }
  }

  let path = '/rebate/partner/commission_history'
  let result
  try {
    result = await collect(path)
  } catch {
    path = '/rebate/agency/commission_history'
    result = await collect(path)
  }

  // Referral count from the partner subordinate list (partner tier only).
  let referrals: number | undefined
  if (path === '/rebate/partner/commission_history') {
    try {
      const subs = await gateGet(creds.apiKey, creds.apiSecret, '/rebate/partner/sub_list', 'limit=1&offset=0')
      const total = Number(subs?.total)
      if (total > 0) referrals = total
    } catch {
      // leave referrals unset if the tier does not allow it
    }
  }

  const breakdown = []
  let totalUsd = 0
  for (const [currency, amount] of result.totals) {
    const { usd } = await toUsd(amount, currency)
    breakdown.push({ currency, amount: +amount.toFixed(8), usd })
    totalUsd += usd
  }
  breakdown.sort((a, b) => b.usd - a.usd)

  return {
    totalUsd: +totalUsd.toFixed(2),
    referrals,
    breakdown,
    raw: { endpoint: path, records: result.records, windows: result.windows, perAsset: Object.fromEntries(result.totals) },
  }
}
