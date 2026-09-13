import { hmacSha256Base64 } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.kucoin.com'
const PATH = '/api/v2/affiliate/queryMyCommission'
const PAGE_SIZE = 100

// Settled affiliate commission records, paginated by page/totalPage. rebateType=0
// covers direct + secondary rebates; with no time window the endpoint returns the
// full history. Requires an affiliate API key (General permission). Signing per
// https://www.kucoin.com/docs-new/rest/affiliate/get-commission and
// https://www.kucoin.com/docs/basic-info/.../signing-a-message:
// sign = base64 HMAC-SHA256(secret, timestamp + 'GET' + path + '?' + query),
// passphrase = base64 HMAC-SHA256(secret, passphrase) with KC-API-KEY-VERSION=2.
// verify against live account — docs inconclusive on max pageSize
export const kucoin: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for kucoin')
  if (!creds.passphrase) throw new Error('passphrase is required for kucoin')

  const totals = new Map<string, number>()
  let totalNum = 0
  let page = 1
  let totalPage = 1

  do {
    const params = new URLSearchParams({
      rebateType: '0',
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    const query = params.toString()
    const timestamp = Date.now().toString()
    const sign = hmacSha256Base64(creds.apiSecret, `${timestamp}GET${PATH}?${query}`)

    const res = await fetch(`${BASE}${PATH}?${query}`, {
      headers: {
        'KC-API-KEY': creds.apiKey,
        'KC-API-SIGN': sign,
        'KC-API-PASSPHRASE': hmacSha256Base64(creds.apiSecret, creds.passphrase),
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-KEY-VERSION': '2',
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || body?.code !== '200000') {
      throw new Error(`KuCoin ${res.status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
    }

    const data = body.data ?? {}
    totalNum = Number(data.totalNum) || 0
    totalPage = Number(data.totalPage) || 1
    for (const item of data.items ?? []) {
      const n = Number(item.commission)
      if (!n || !item.currency) continue
      totals.set(item.currency, (totals.get(item.currency) ?? 0) + n)
    }
    page += 1
  } while (page <= totalPage)

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
    breakdown,
    raw: { pages: page - 1, totalNum, perCoin: Object.fromEntries(totals) },
  }
}
