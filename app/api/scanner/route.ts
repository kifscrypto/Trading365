import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const maxDuration = 60
const ROUTE_VERSION = 'v4-okx-hyperliquid'

// Kline tuple: [time, open, high, low, close, volume, ...]
type Kline = [string, string, string, string, string, string, ...string[]]

interface ScanResult {
  symbol: string
  price: number
  oi_usd: number
  funding_pct: number
  score: number
  signals: string[]
  exchange: string
  scanned_at: string
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
}

// --- Scoring ---

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out = new Array<number>(values.length)
  out[0] = values[0]
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

function scoreKlines(
  klines: Kline[],
  price: number,
  fundingRate: number   // expects 8h-equivalent rate
): { score: number; signals: string[] } {
  const signals: string[] = []
  let score = 0
  if (klines.length < 50) return { score, signals }

  const closes = klines.map(k => parseFloat(k[4]))
  const highs  = klines.map(k => parseFloat(k[2]))

  // Signal 1 — Price vs 200 EMA (0–3 pts)
  if (closes.length >= 200) {
    const ema200 = calcEMA(closes, 200)
    const e = ema200[ema200.length - 1]
    const pctBelow = (e - price) / e
    if (pctBelow > 0.10)      { score += 3; signals.push('far_below_200ema') }
    else if (pctBelow > 0.02) { score += 2; signals.push('below_200ema') }
    else if (pctBelow > 0)    { score += 1; signals.push('near_200ema') }
  }

  // Signal 2 — Lower highs structure (0–2 pts)
  if (highs.length >= 20) {
    const slice  = highs.slice(-20)
    const recent = slice.slice(10).reduce((a, b) => a + b, 0) / 10
    const prev   = slice.slice(0, 10).reduce((a, b) => a + b, 0) / 10
    const drop   = (prev - recent) / prev
    if (drop > 0.03)   { score += 2; signals.push('lower_highs') }
    else if (drop > 0) { score += 1; signals.push('weak_lower_highs') }
  }

  // Signal 3 — Bear candles carry more volume (0–2 pts)
  const last50 = klines.slice(-50)
  let bearV = 0, bearN = 0, bullV = 0, bullN = 0
  for (const k of last50) {
    const v = parseFloat(k[5])
    if (parseFloat(k[4]) < parseFloat(k[1])) { bearV += v; bearN++ }
    else                                       { bullV += v; bullN++ }
  }
  const ratio = bearN > 0 && bullN > 0 ? (bearV / bearN) / (bullV / bullN) : 1
  if (ratio > 1.20)   { score += 2; signals.push('heavy_bear_vol') }
  else if (ratio > 1) { score += 1; signals.push('bear_vol') }

  // Signal 4 — Positive funding rate (0–3 pts, based on 8h-equivalent rate)
  if (fundingRate > 0.0005)      { score += 3; signals.push('high_funding') }
  else if (fundingRate > 0.0001) { score += 2; signals.push('pos_funding') }
  else if (fundingRate > 0)      { score += 1; signals.push('slight_funding') }

  return { score, signals }
}

// --- OKX ---

async function okxKlines(instId: string): Promise<Kline[]> {
  const r = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=4H&limit=200`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  // OKX: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm] — newest first
  return ((d.data ?? []) as Kline[]).reverse()
}

async function okxFunding(instId: string): Promise<number> {
  const r = await fetch(
    `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return 0
  const d = await r.json()
  return parseFloat(d.data?.[0]?.fundingRate ?? '0')
}

async function runOKXScan(): Promise<ScanResult[]> {
  const [tickerRes, oiRes] = await Promise.all([
    fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { cache: 'no-store', headers: HEADERS }),
    fetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP', { cache: 'no-store', headers: HEADERS }),
  ])
  if (!tickerRes.ok || !oiRes.ok) throw new Error(`OKX HTTP ${tickerRes.status}/${oiRes.status}`)

  type OKXTicker = { instId: string; last: string }
  type OKXOIItem = { instId: string; oiCcy: string }

  const [tickerJson, oiJson] = await Promise.all([tickerRes.json(), oiRes.json()])
  const tickers = (tickerJson.data ?? []) as OKXTicker[]
  const oiItems = (oiJson.data   ?? []) as OKXOIItem[]

  // oiCcy = OI in base currency; USD OI = oiCcy × price
  const oiMap = new Map(oiItems.map(i => [i.instId, parseFloat(i.oiCcy)]))

  const qualified = tickers
    .filter(t => t.instId.endsWith('-USDT-SWAP'))
    .map(t => ({
      instId: t.instId,
      price:  parseFloat(t.last),
      oiUsd:  (oiMap.get(t.instId) ?? 0) * parseFloat(t.last),
    }))
    .filter(t => t.oiUsd > 15_000_000)
    .sort((a, b) => b.oiUsd - a.oiUsd)
    .slice(0, 60)

  const results: ScanResult[] = []
  for (let i = 0; i < qualified.length; i += 10) {
    const batch = qualified.slice(i, i + 10)
    const [klineRes, fundingRes] = await Promise.all([
      Promise.allSettled(batch.map(t => okxKlines(t.instId))),
      Promise.allSettled(batch.map(t => okxFunding(t.instId))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const funding = fundingRes[j].status === 'fulfilled'
        ? (fundingRes[j] as PromiseFulfilledResult<number>).value
        : 0
      const { score, signals } = scoreKlines(kl, t.price, funding)
      results.push({
        symbol:      t.instId.replace('-USDT-SWAP', 'USDT'),
        price:       t.price,
        oi_usd:      t.oiUsd,
        funding_pct: funding * 100,
        score,
        signals,
        exchange:    'okx',
        scanned_at:  new Date().toISOString(),
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- Hyperliquid ---

async function hyperliquidKlines(coin: string): Promise<Kline[]> {
  const endTime   = Date.now()
  const startTime = endTime - 210 * 4 * 60 * 60 * 1000 // ~210 4h candles back

  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    cache:  'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '4h', startTime, endTime } }),
  })
  if (!r.ok) return []
  const candles = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  // Hyperliquid returns oldest-first
  return candles.map(c => [String(c.t), c.o, c.h, c.l, c.c, c.v] as Kline)
}

async function runHyperliquidScan(): Promise<ScanResult[]> {
  // Single call returns ALL perp metadata + live context (price, OI, funding)
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    cache:  'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  })
  if (!r.ok) throw new Error(`Hyperliquid HTTP ${r.status}`)

  type HLMeta = { universe: Array<{ name: string }> }
  type HLCtx  = { funding: string; openInterest: string; markPx: string; dayNtlVlm: string }
  const [meta, ctxs] = await r.json() as [HLMeta, HLCtx[]]

  const qualified: Array<{ coin: string; price: number; oiUsd: number; funding8h: number }> = []
  for (let i = 0; i < meta.universe.length; i++) {
    const coin = meta.universe[i].name
    const ctx  = ctxs[i]
    if (!ctx?.markPx) continue
    const price   = parseFloat(ctx.markPx)
    const oiUsd   = parseFloat(ctx.openInterest) * price
    if (oiUsd < 15_000_000) continue
    // HL funding is hourly — multiply by 8 for 8h-equivalent so scoring matches OKX
    const funding8h = parseFloat(ctx.funding) * 8
    qualified.push({ coin, price, oiUsd, funding8h })
  }

  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 60)

  const results: ScanResult[] = []
  for (let i = 0; i < top.length; i += 10) {
    const batch   = top.slice(i, i + 10)
    const settled = await Promise.allSettled(batch.map(t => hyperliquidKlines(t.coin)))
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (settled[j].status !== 'fulfilled') continue
      const kl = (settled[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const { score, signals } = scoreKlines(kl, t.price, t.funding8h)
      results.push({
        symbol:      t.coin + 'USDT',
        price:       t.price,
        oi_usd:      t.oiUsd,
        funding_pct: t.funding8h * 100,
        score,
        signals,
        exchange:    'hyperliquid',
        scanned_at:  new Date().toISOString(),
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- Route handler ---

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const exchange     = (searchParams.get('exchange') ?? 'okx').toLowerCase()
  const forceRefresh = searchParams.get('refresh') === '1'

  const sql = neon(process.env.DATABASE_URL!)

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS scanner_results (
        id          SERIAL PRIMARY KEY,
        symbol      TEXT NOT NULL,
        price       NUMERIC,
        oi_usd      NUMERIC,
        funding_pct NUMERIC,
        score       INTEGER,
        signals     JSONB        DEFAULT '[]',
        exchange    TEXT         DEFAULT 'okx',
        scanned_at  TIMESTAMPTZ  DEFAULT NOW()
      )
    `

    if (!forceRefresh) {
      const cached = await sql`
        SELECT symbol, price::float, oi_usd::float, funding_pct::float,
               score, signals, exchange, scanned_at
        FROM   scanner_results
        WHERE  exchange   = ${exchange}
          AND  scanned_at > NOW() - INTERVAL '5 minutes'
        ORDER  BY score DESC
        LIMIT  20
      `
      if (cached.length > 0) {
        return NextResponse.json({ results: cached, cached: true, exchange })
      }
    }

    const results = exchange === 'hyperliquid'
      ? await runHyperliquidScan()
      : await runOKXScan()

    await sql`DELETE FROM scanner_results WHERE exchange = ${exchange}`
    await Promise.all(
      results.map(r => sql`
        INSERT INTO scanner_results
          (symbol, price, oi_usd, funding_pct, score, signals, exchange, scanned_at)
        VALUES (
          ${r.symbol}, ${r.price}, ${r.oi_usd}, ${r.funding_pct},
          ${r.score}, ${JSON.stringify(r.signals)}::jsonb,
          ${r.exchange}, ${r.scanned_at}::timestamptz
        )
      `)
    )

    return NextResponse.json({ results, cached: false, exchange, v: ROUTE_VERSION })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scanner]', msg)
    return NextResponse.json({ error: 'Scan failed', detail: msg }, { status: 500 })
  }
}
