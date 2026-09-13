import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.ourbit.com'
const AFFILIATE_PATH = '/api/v3/rebate/affiliate/commission'
const TAX_PATH = '/api/v3/rebate/taxQuery'
const PAGE_SIZE = 100

// Binance-style signing (github.com/ourbitdevelop/apidocs): every SIGNED GET
// sends the api key in X-OURBIT-APIKEY and signs the full query string
// (incl. timestamp) with HMAC-SHA256, appended as &signature=. All rebate
// figures are already denominated in USDT.
// Primary: /rebate/affiliate/commission (agent accounts; last 6 months by
// default). Non-agent keys fall back to /rebate/taxQuery (last year). Both
// paginate; we sum the per-invitee "total" field across all pages.
// verify against live account — docs don't state the max pageSize.
export const ourbit: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for ourbit')

  try {
    return await affiliateCommission(creds.apiKey, creds.apiSecret)
  } catch {
    return await taxQuery(creds.apiKey, creds.apiSecret)
  }
}

async function signedGet(apiKey: string, secret: string, path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString()
  const signature = hmacSha256Hex(secret, query)

  const res = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    headers: { 'X-OURBIT-APIKEY': apiKey },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Ourbit ${res.status}: ${body?.message ?? body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
  }
  return body
}

async function affiliateCommission(apiKey: string, secret: string): ReturnType<Adapter> {
  let total = 0
  let referrals: number | undefined
  let page = 1
  let totalPage = 1

  while (page <= totalPage) {
    const body = await signedGet(apiKey, secret, AFFILIATE_PATH, { page: String(page), pageSize: String(PAGE_SIZE) })
    if (body?.success === false || !body?.data) {
      throw new Error(`Ourbit affiliate commission: ${body?.message ?? 'request failed'} (code ${body?.code ?? '?'})`)
    }

    const data = body.data
    referrals = data.totalCount ?? referrals
    totalPage = data.totalPage ?? 1
    for (const row of data.resultList ?? []) {
      total += Number(row.total) || 0
    }
    page += 1
  }

  return buildResult(total, referrals, { source: 'affiliate/commission', pages: totalPage })
}

async function taxQuery(apiKey: string, secret: string): ReturnType<Adapter> {
  let total = 0
  let referrals: number | undefined
  let page = 1
  let totalPage = 1

  while (page <= totalPage) {
    const body = await signedGet(apiKey, secret, TAX_PATH, { page: String(page) })
    if (!Array.isArray(body?.data)) {
      throw new Error(`Ourbit taxQuery: ${body?.msg ?? body?.message ?? 'request failed'} (code ${body?.code ?? '?'})`)
    }

    referrals = body.totalRecords ?? referrals
    totalPage = body.totalPageNum ?? 1
    for (const row of body.data) {
      total += Number(row.total) || 0
    }
    page += 1
  }

  return buildResult(total, referrals, { source: 'rebate/taxQuery', pages: totalPage })
}

async function buildResult(usdtAmount: number, referrals: number | undefined, raw: unknown) {
  const { usd } = await toUsd(usdtAmount, 'USDT')
  return {
    totalUsd: +usd.toFixed(2),
    referrals,
    breakdown: [{ currency: 'USDT', amount: +usdtAmount.toFixed(8), usd }],
    raw: { ...raw as object, usdtAmount: +usdtAmount.toFixed(8) },
  }
}
