import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.xt.com'
const USERS_PATH = '/v4/referal/invite/users'
const COMMISSIONS_PATH = '/v4/referal/invite/commissions'
const RECV_WINDOW = '60000'
const PAGE_SIZE = 100

// User-center API (host api.xt.com per the official docs, not sapi.xt.com).
// Signing: X = the validate-* header pairs sorted alphabetically and joined with
// '&', Y = '#GET#<path>#<query>' with the query keys sorted lexicographically;
// signature = hex HMAC-SHA256(secret, X + Y) sent as validate-signature.
// Commissions are only exposed per invitee (uid is mandatory), so we page
// through /v4/referal/invite/users first, then sum each user's commission rows
// per currency. verify against live account — docs inconclusive on the default
// time window of /v4/referal/invite/commissions when startTime/endTime are omitted.
export const xt: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for xt')

  const get = async (path: string, params: Record<string, string | number | undefined>) => {
    const query = Object.entries(params)
      .filter((e): e is [string, string | number] => e[1] !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    const timestamp = Date.now().toString()
    const x = `validate-algorithms=HmacSHA256&validate-appkey=${creds.apiKey}&validate-recvwindow=${RECV_WINDOW}&validate-timestamp=${timestamp}`
    const y = query ? `#GET#${path}#${query}` : `#GET#${path}`
    const signature = hmacSha256Hex(creds.apiSecret as string, x + y)

    const res = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`, {
      headers: {
        'Content-Type': 'application/json',
        'validate-algorithms': 'HmacSHA256',
        'validate-appkey': creds.apiKey,
        'validate-recvwindow': RECV_WINDOW,
        'validate-timestamp': timestamp,
        'validate-signature': signature,
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || body?.rc !== 0) {
      throw new Error(`XT ${res.status}: ${body?.mc ?? 'request failed'} (rc ${body?.rc ?? '?'})`)
    }
    return body.result
  }

  const uids: number[] = []
  let fromId: number | undefined
  let userPages = 0
  for (;;) {
    const result = await get(USERS_PATH, { fromId, direction: 'NEXT', limit: PAGE_SIZE })
    const items = result?.items ?? []
    userPages += 1
    for (const user of items) {
      if (user.userId) uids.push(Number(user.userId))
    }
    if (!result?.hasNext || items.length === 0) break
    fromId = items[items.length - 1].id
  }

  const totals = new Map<string, number>()
  for (const uid of uids) {
    const result = await get(COMMISSIONS_PATH, { uid })
    for (const row of result ?? []) {
      const n = Number(row.commission)
      const currency = String(row.commissionCurrency ?? '').toUpperCase()
      if (!n || !currency) continue
      totals.set(currency, (totals.get(currency) ?? 0) + n)
    }
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
    referrals: uids.length,
    breakdown,
    raw: { userPages, perCoin: Object.fromEntries(totals) },
  }
}
