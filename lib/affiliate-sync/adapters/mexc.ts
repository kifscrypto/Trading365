import { hmacSha256Hex } from '../sign'
import { toUsd } from '../to-usd'
import type { Adapter } from '../types'

const BASE = 'https://api.mexc.com'
const AFFILIATE_PATH = '/api/v3/rebate/affiliate/commission'
const FALLBACK_PATH = '/api/v3/rebate/taxQuery'
const RECV_WINDOW = '5000'
const PAGE_SIZE = 100
const MAX_PAGES = 200
// Wide window so the sum reads as lifetime commission; without startTime the
// affiliate endpoint returns only the last six months.
const START_TIME = '1577836800000' // 2020-01-01

type Page = { list: Record<string, string>[]; totalCount: number; totalPage: number }

// Per-invitee affiliate commission, paginated; all amounts are already USDT.
// The affiliate-only endpoint is tried first, with the generic rebate taxQuery
// as fallback for plain referral keys. Binance-style signing: hex HMAC-SHA256
// of the query string (incl. timestamp & recvWindow), appended as &signature=.
export const mexc: Adapter = async (creds) => {
  if (!creds.apiSecret) throw new Error('apiSecret is required for mexc')
  const secret = creds.apiSecret

  const signedGet = async (path: string, params: Record<string, string>) => {
    const query = new URLSearchParams({
      ...params,
      recvWindow: RECV_WINDOW,
      timestamp: Date.now().toString(),
    }).toString()
    const signature = hmacSha256Hex(secret, query)
    const res = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
      headers: { 'X-MEXC-APIKEY': creds.apiKey },
      cache: 'no-store',
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }

  const fetchAffiliate = async (page: number): Promise<Page> => {
    const { status, body } = await signedGet(AFFILIATE_PATH, {
      startTime: START_TIME,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (status !== 200 || body?.success !== true) {
      throw new Error(`MEXC affiliate ${status}: ${body?.message ?? 'request failed'} (code ${body?.code ?? '?'})`)
    }
    const data = body.data ?? {}
    return { list: data.resultList ?? [], totalCount: data.totalCount ?? 0, totalPage: data.totalPage ?? 1 }
  }

  const fetchTax = async (page: number): Promise<Page> => {
    const { status, body } = await signedGet(FALLBACK_PATH, { page: String(page) })
    if (status !== 200 || body?.code) {
      throw new Error(`MEXC taxQuery ${status}: ${body?.msg ?? 'request failed'} (code ${body?.code ?? '?'})`)
    }
    return { list: body.data ?? [], totalCount: body.totalRecords ?? 0, totalPage: body.totalPageNum ?? 1 }
  }

  const sums = { spot: 0, etf: 0, futures: 0, total: 0 }
  let referrals = 0
  let pages = 0
  let page = 0
  let totalPage = 1
  let fetcher = fetchAffiliate
  let endpoint = AFFILIATE_PATH

  do {
    page += 1
    let data: Page
    try {
      data = await fetcher(page)
    } catch (err) {
      if (fetcher === fetchTax) throw err
      fetcher = fetchTax
      endpoint = FALLBACK_PATH
      try {
        data = await fetchTax(page)
      } catch (fallbackErr) {
        throw new Error(`${(err as Error).message}; fallback ${(fallbackErr as Error).message}`)
      }
    }

    pages += 1
    referrals = data.totalCount
    totalPage = data.totalPage
    for (const row of data.list) {
      sums.spot += Number(row.spot) || 0
      sums.etf += Number(row.etf) || 0
      sums.futures += Number(row.futures) || 0
      sums.total += Number(row.total) || 0
    }
  } while (page < totalPage && pages < MAX_PAGES)

  const { usd } = await toUsd(sums.total, 'USDT')

  return {
    totalUsd: +usd.toFixed(2),
    referrals,
    breakdown: [{ currency: 'USDT', amount: +sums.total.toFixed(8), usd }],
    raw: { endpoint, pages, referrals, ...Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, +v.toFixed(8)])) },
  }
}
