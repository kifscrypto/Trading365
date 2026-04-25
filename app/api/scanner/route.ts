import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const maxDuration = 60

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
  fundingRate: number
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

  // Signal 4 — Positive funding rate (0–3 pts)
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

  type OKXTicker  = { instId: string; last: string }
  type OKXOIItem  = { instId: string; oiCcy: string }

  const [tickerJson, oiJson] = await Promise.all([tickerRes.json(), oiRes.json()])
  const tickers = (tickerJson.data ?? []) as OKXTicker[]
  const oiItems = (oiJson.data   ?? []) as OKXOIItem[]

  // oiCcy = OI in base currency units; USD OI = oiCcy × price
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

// --- Binance ---

async function binanceKlines(symbol: string): Promise<Kline[]> {
  const r = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=200`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  return r.json() // Binance already oldest-first
}

async function runBinanceScan(): Promise<ScanResult[]> {
  const [tickerRes, fundingRes] = await Promise.all([
    fetch('https://fapi.binance.com/fapi/v1/ticker/24hr',  { cache: 'no-store', headers: HEADERS }),
    fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { cache: 'no-store', headers: HEADERS }),
  ])
  if (!tickerRes.ok || !fundingRes.ok) throw new Error(`Binance HTTP ${tickerRes.status}/${fundingRes.status}`)

  type BinanceTicker  = { symbol: string; lastPrice: string; quoteVolume: string }
  type BinanceFunding = { symbol: string; lastFundingRate: string }
  const [tickers, fundings]: [BinanceTicker[], BinanceFunding[]] =
    await Promise.all([tickerRes.json(), fundingRes.json()])

  const fundingMap = new Map(fundings.map(f => [f.symbol, parseFloat(f.lastFundingRate)]))

  // Filter USDT perps, 24h USD volume > $50M (proxy for liquidity — no batch OI on Binance)
  const qualified = tickers
    .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 50_000_000)
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, 60)

  const results: ScanResult[] = []
  for (let i = 0; i < qualified.length; i += 10) {
    const batch   = qualified.slice(i, i + 10)
    const settled = await Promise.allSettled(batch.map(t => binanceKlines(t.symbol)))
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (settled[j].status !== 'fulfilled') continue
      const kl = (settled[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const price   = parseFloat(t.lastPrice)
      const funding = fundingMap.get(t.symbol) ?? 0
      const { score, signals } = scoreKlines(kl, price, funding)
      results.push({
        symbol:      t.symbol,
        price,
        oi_usd:      0, // Binance has no batch OI endpoint on public API
        funding_pct: funding * 100,
        score,
        signals,
        exchange:    'binance',
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

    const results = exchange === 'binance'
      ? await runBinanceScan()
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

    return NextResponse.json({ results, cached: false, exchange })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scanner]', msg)
    return NextResponse.json({ error: 'Scan failed', detail: msg }, { status: 500 })
  }
}
