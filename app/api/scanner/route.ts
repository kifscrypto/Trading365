import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const maxDuration = 60
const ROUTE_VERSION = 'v5-btc-sentiment'

type Kline = [string, string, string, string, string, string, ...string[]]
type SqlClient = ReturnType<typeof neon>

interface SentimentCondition {
  fng: number
  btcDominance: number
  btcFunding: number
  btcStructure: 'bullish' | 'neutral' | 'bearish'
  domTrend: 'up' | 'down' | 'flat'
}

interface RawResult {
  symbol: string
  price: number
  oi_usd: number
  funding_pct: number
  score: number
  signals: string[]
  exchange: string
  scanned_at: string
}

interface ScanResult extends RawResult {
  adjusted_score: number
  fng: number
  btc_dominance: number
  btc_funding: number
  btc_dom_trend: string
  market_condition: 'favourable' | 'neutral' | 'hostile'
  sentiment_flags: string[]
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

  if (closes.length >= 200) {
    const ema200 = calcEMA(closes, 200)
    const e = ema200[ema200.length - 1]
    const pctBelow = (e - price) / e
    if (pctBelow > 0.10)      { score += 3; signals.push('far_below_200ema') }
    else if (pctBelow > 0.02) { score += 2; signals.push('below_200ema') }
    else if (pctBelow > 0)    { score += 1; signals.push('near_200ema') }
  }

  if (highs.length >= 20) {
    const slice  = highs.slice(-20)
    const recent = slice.slice(10).reduce((a, b) => a + b, 0) / 10
    const prev   = slice.slice(0, 10).reduce((a, b) => a + b, 0) / 10
    const drop   = (prev - recent) / prev
    if (drop > 0.03)   { score += 2; signals.push('lower_highs') }
    else if (drop > 0) { score += 1; signals.push('weak_lower_highs') }
  }

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

  if (fundingRate > 0.0005)      { score += 3; signals.push('high_funding') }
  else if (fundingRate > 0.0001) { score += 2; signals.push('pos_funding') }
  else if (fundingRate > 0)      { score += 1; signals.push('slight_funding') }

  return { score, signals }
}

function applyBtcSentiment(rawScore: number, s: SentimentCondition): {
  adjustedScore: number
  marketCondition: 'favourable' | 'neutral' | 'hostile'
  sentimentFlags: string[]
} {
  const sentimentFlags: string[] = []
  let fav = 0
  let hos = 0

  if (s.fng >= 75)      { sentimentFlags.push('extreme_greed'); fav += 2 }
  else if (s.fng >= 60) { sentimentFlags.push('greed');         fav += 1 }
  else if (s.fng <= 20) { sentimentFlags.push('extreme_fear');  hos += 2 }
  else if (s.fng <= 35) { sentimentFlags.push('fear');          hos += 1 }

  if (s.btcFunding > 0.0003)       { sentimentFlags.push('btc_high_longs');  fav += 1 }
  else if (s.btcFunding > 0)       { sentimentFlags.push('btc_pos_funding'); fav += 1 }
  else if (s.btcFunding < -0.0001) { sentimentFlags.push('btc_crowd_short'); hos += 1 }

  if (s.btcStructure === 'bearish')  { sentimentFlags.push('btc_bearish'); fav += 1 }
  else if (s.btcStructure === 'bullish') { sentimentFlags.push('btc_bullish'); hos += 1 }

  if (s.domTrend === 'up')        { sentimentFlags.push('dom_rising');  fav += 1 }
  else if (s.domTrend === 'down') { sentimentFlags.push('dom_falling'); hos += 1 }

  const marketCondition: 'favourable' | 'neutral' | 'hostile' =
    hos >= 2 && hos >= fav ? 'hostile' :
    fav >= 2               ? 'favourable' :
                             'neutral'

  const delta = marketCondition === 'hostile' ? -2 : marketCondition === 'favourable' ? 1 : 0
  const adjustedScore = Math.max(0, Math.min(10, rawScore + delta))

  return { adjustedScore, marketCondition, sentimentFlags }
}

// --- OKX ---

async function okxKlines(instId: string): Promise<Kline[]> {
  const r = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=4H&limit=200`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
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

async function runOKXScan(): Promise<RawResult[]> {
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

  const oiMap = new Map(oiItems.map(i => [i.instId, parseFloat(i.oiCcy)]))

  const qualified = tickers
    .filter(t => t.instId.endsWith('-USDT-SWAP'))
    .map(t => ({
      instId: t.instId,
      price:  parseFloat(t.last),
      oiUsd:  (oiMap.get(t.instId) ?? 0) * parseFloat(t.last),
    }))
    .filter(t => t.oiUsd > 50_000_000)
    .sort((a, b) => b.oiUsd - a.oiUsd)
    .slice(0, 60)

  const results: RawResult[] = []
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
  const startTime = endTime - 210 * 4 * 60 * 60 * 1000

  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    cache:  'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '4h', startTime, endTime } }),
  })
  if (!r.ok) return []
  const candles = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  return candles.map(c => [String(c.t), c.o, c.h, c.l, c.c, c.v] as Kline)
}

async function runHyperliquidScan(): Promise<RawResult[]> {
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
    const price     = parseFloat(ctx.markPx)
    const oiUsd     = parseFloat(ctx.openInterest) * price
    if (oiUsd < 50_000_000) continue
    const funding8h = parseFloat(ctx.funding) * 8
    qualified.push({ coin, price, oiUsd, funding8h })
  }

  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 60)

  const results: RawResult[] = []
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

// --- BTC Sentiment ---

async function fetchBtcSentimentData(sql: SqlClient): Promise<SentimentCondition> {
  try {
    const [fngRes, domRes, klinesRes, fundingRes] = await Promise.allSettled([
      fetch('https://api.alternative.me/fng/', { cache: 'no-store', headers: HEADERS }),
      fetch('https://api.coingecko.com/api/v3/global', { cache: 'no-store', headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY! } }),
      okxKlines('BTC-USDT-SWAP'),
      okxFunding('BTC-USDT-SWAP'),
    ])

    let fng = 50
    if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
      try {
        const d = await fngRes.value.json()
        fng = parseInt(d.data?.[0]?.value ?? '50', 10)
      } catch { /* use default */ }
    }

    let btcDominance = 0
    let domTrend: 'up' | 'down' | 'flat' = 'flat'
    if (domRes.status === 'fulfilled' && domRes.value.ok) {
      try {
        const d = await domRes.value.json()
        btcDominance = d.data?.market_cap_percentage?.btc ?? 0

        await sql`
          CREATE TABLE IF NOT EXISTS btc_dominance_history (
            id          SERIAL PRIMARY KEY,
            value       FLOAT       NOT NULL,
            recorded_at TIMESTAMPTZ DEFAULT NOW()
          )
        `
        const prev = await sql`
          SELECT value FROM btc_dominance_history
          ORDER BY recorded_at DESC LIMIT 1
        `
        if (prev.length > 0) {
          const diff = btcDominance - (prev[0].value as number)
          if (diff > 0.2)       domTrend = 'up'
          else if (diff < -0.2) domTrend = 'down'
        }

        await sql`INSERT INTO btc_dominance_history (value) VALUES (${btcDominance})`
        await sql`
          DELETE FROM btc_dominance_history
          WHERE id NOT IN (
            SELECT id FROM btc_dominance_history ORDER BY recorded_at DESC LIMIT 100
          )
        `
      } catch { /* use defaults */ }
    }

    let btcStructure: 'bullish' | 'neutral' | 'bearish' = 'neutral'
    if (klinesRes.status === 'fulfilled') {
      const kl = klinesRes.value
      if (kl.length >= 50) {
        const closes = kl.map(k => parseFloat(k[4]))
        const highs  = kl.map(k => parseFloat(k[2]))
        const price  = closes[closes.length - 1]
        const ema50  = calcEMA(closes, 50)
        const e50    = ema50[ema50.length - 1]

        if (highs.length >= 20) {
          const slice  = highs.slice(-20)
          const recent = slice.slice(10).reduce((a, b) => a + b, 0) / 10
          const prior  = slice.slice(0, 10).reduce((a, b) => a + b, 0) / 10
          const lh     = (prior - recent) / prior > 0.02
          if (price < e50 && lh) btcStructure = 'bearish'
          else if (price > e50)  btcStructure = 'bullish'
        }
      }
    }

    let btcFunding = 0
    if (fundingRes.status === 'fulfilled') {
      btcFunding = (fundingRes as PromiseFulfilledResult<number>).value
    }

    return { fng, btcDominance, btcFunding, btcStructure, domTrend }
  } catch {
    return { fng: 50, btcDominance: 0, btcFunding: 0, btcStructure: 'neutral', domTrend: 'flat' }
  }
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

    await Promise.all([
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS fng             INTEGER`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_dominance   NUMERIC`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_funding     NUMERIC`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_dom_trend   TEXT`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS market_condition TEXT`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS adjusted_score  INTEGER`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS sentiment_flags JSONB DEFAULT '[]'`,
    ])

    if (!forceRefresh) {
      const cached = await sql`
        SELECT symbol, price::float, oi_usd::float, funding_pct::float,
               score, signals, exchange, scanned_at,
               adjusted_score, fng, btc_dominance::float, btc_funding::float,
               btc_dom_trend, market_condition, sentiment_flags
        FROM   scanner_results
        WHERE  exchange       = ${exchange}
          AND  scanned_at     > NOW() - INTERVAL '5 minutes'
          AND  adjusted_score IS NOT NULL
        ORDER  BY adjusted_score DESC
        LIMIT  20
      `
      if (cached.length > 0) {
        const first = cached[0]
        return NextResponse.json({
          results: cached,
          sentiment: {
            fng:             first.fng,
            btcDominance:    first.btc_dominance,
            domTrend:        first.btc_dom_trend ?? 'flat',
            btcFunding:      first.btc_funding,
            marketCondition: first.market_condition ?? 'neutral',
            sentimentFlags:  (first.sentiment_flags as string[] | null) ?? [],
          },
          cached: true,
          exchange,
        })
      }
    }

    const [rawResults, sentiment] = await Promise.all([
      exchange === 'hyperliquid' ? runHyperliquidScan() : runOKXScan(),
      fetchBtcSentimentData(sql),
    ])

    const results: ScanResult[] = rawResults.map(r => {
      const { adjustedScore, marketCondition, sentimentFlags } = applyBtcSentiment(r.score, sentiment)
      return {
        ...r,
        adjusted_score:   adjustedScore,
        fng:              sentiment.fng,
        btc_dominance:    sentiment.btcDominance,
        btc_funding:      sentiment.btcFunding,
        btc_dom_trend:    sentiment.domTrend,
        market_condition: marketCondition,
        sentiment_flags:  sentimentFlags,
      }
    }).sort((a, b) => b.adjusted_score - a.adjusted_score)

    await sql`DELETE FROM scanner_results WHERE exchange = ${exchange}`
    await Promise.all(
      results.map(r => sql`
        INSERT INTO scanner_results (
          symbol, price, oi_usd, funding_pct, score, signals, exchange, scanned_at,
          adjusted_score, fng, btc_dominance, btc_funding, btc_dom_trend, market_condition, sentiment_flags
        ) VALUES (
          ${r.symbol}, ${r.price}, ${r.oi_usd}, ${r.funding_pct},
          ${r.score}, ${JSON.stringify(r.signals)}::jsonb,
          ${r.exchange}, ${r.scanned_at}::timestamptz,
          ${r.adjusted_score}, ${r.fng}, ${r.btc_dominance}, ${r.btc_funding},
          ${r.btc_dom_trend}, ${r.market_condition}, ${JSON.stringify(r.sentiment_flags)}::jsonb
        )
      `)
    )

    return NextResponse.json({
      results,
      sentiment: {
        fng:             sentiment.fng,
        btcDominance:    sentiment.btcDominance,
        domTrend:        sentiment.domTrend,
        btcFunding:      sentiment.btcFunding,
        marketCondition: results[0]?.market_condition ?? 'neutral',
        sentimentFlags:  results[0]?.sentiment_flags ?? [],
      },
      cached: false,
      exchange,
      v: ROUTE_VERSION,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scanner]', msg)
    return NextResponse.json({ error: 'Scan failed', detail: msg }, { status: 500 })
  }
}
