/**
 * Shared scanner logic — imported by all three scanner route files.
 * Not a route itself; Next.js only treats route.ts as an API endpoint.
 */
import { neon } from '@neondatabase/serverless'

export type Kline = [string, string, string, string, string, string, ...string[]]
export type SqlClient = ReturnType<typeof neon>

export interface SentimentCondition {
  fng: number
  btcDominance: number
  btcFunding: number
  btcStructure: 'bullish' | 'neutral' | 'bearish'
  domTrend: 'up' | 'down' | 'flat'
}

export interface RawResult {
  symbol: string
  price: number
  oi_usd: number
  funding_pct: number
  score: number
  signals: string[]
  exchange: string
  scanned_at: string
}

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
}

// --- Indicators ---

export function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out = new Array<number>(values.length)
  out[0] = values[0]
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

export function calcRSI(closes: number[], period = 14): number {
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff; else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
}

export function calcMACD(closes: number[]): { macd: number; signal: number } {
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = calcEMA(macdLine, 9)
  return {
    macd:   macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
  }
}

// --- Scoring (max raw ~15) ---

export function scoreKlines(
  klines: Kline[],
  dailyKlines: Kline[],
  price: number,
  fundingRate: number
): { score: number; signals: string[]; skip: boolean } {
  const signals: string[] = []
  let score = 0

  if (klines.length < 50) return { score, signals, skip: false }

  const closes = klines.map(k => parseFloat(k[4]))
  const highs  = klines.map(k => parseFloat(k[2]))
  const lows   = klines.map(k => parseFloat(k[3]))

  // Signal 1 — EMA200 distance banding (0–2 pts)
  if (closes.length >= 200) {
    const ema200 = calcEMA(closes, 200)
    const e = ema200[ema200.length - 1]
    const pctBelow = (e - price) / e
    if (pctBelow >= 0.25) {
      score += 2; signals.push(`ema_-${Math.round(pctBelow * 100)}%`)
    } else if (pctBelow >= 0.10) {
      score += 1; signals.push(`ema_-${Math.round(pctBelow * 100)}%`)
    }
  }

  // Signal 2 — 4H lower highs (0–2 pts)
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

  // Signal 4 — Funding rate (0–3 pts)
  if (fundingRate > 0.0005)      { score += 3; signals.push('high_funding') }
  else if (fundingRate > 0.0001) { score += 2; signals.push('pos_funding') }
  else if (fundingRate > 0)      { score += 1; signals.push('slight_funding') }

  // Signal 5 — RSI: skip if oversold; +1 if overbought
  if (closes.length >= 15) {
    const rsi = calcRSI(closes)
    if (rsi < 30) return { score: 0, signals: [], skip: true }
    if (rsi > 70) { score += 1; signals.push('rsi_ob') }

    // Signal 6 — Bearish RSI divergence (0–2 pts)
    if (lows.length >= 10) {
      const recentLow = Math.min(...lows.slice(-5))
      const priorLow  = Math.min(...lows.slice(-10, -5))
      const rsiPrev   = calcRSI(closes.slice(0, -5))
      if (recentLow > priorLow && rsi < rsiPrev) {
        score += 2; signals.push('rsi_div')
      }
    }
  }

  // Signal 7 — MACD (0–2 pts)
  if (closes.length >= 35) {
    const { macd, signal: macdSig } = calcMACD(closes)
    if (macd < macdSig) { score += 1; signals.push('macd_bear') }
    if (macd < 0 && macdSig < 0) { score += 1; signals.push('macd_zero') }
  }

  // Signal 8 — Daily 200 EMA + lower highs (0–2 pts)
  if (dailyKlines.length >= 200) {
    const dCloses = dailyKlines.map(k => parseFloat(k[4]))
    const dHighs  = dailyKlines.map(k => parseFloat(k[2]))
    const dPrice  = dCloses[dCloses.length - 1]
    const dEma200 = calcEMA(dCloses, 200)
    if (dPrice < dEma200[dEma200.length - 1]) { score += 1; signals.push('d_200ema') }

    if (dHighs.length >= 20) {
      const dSlice  = dHighs.slice(-20)
      const dRecent = dSlice.slice(10).reduce((a, b) => a + b, 0) / 10
      const dPrev   = dSlice.slice(0, 10).reduce((a, b) => a + b, 0) / 10
      if ((dPrev - dRecent) / dPrev > 0.03) { score += 1; signals.push('d_lh') }
    }
  }

  return { score, signals, skip: false }
}

// --- OKX ---

export async function okxKlines(instId: string): Promise<Kline[]> {
  const r = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=4H&limit=200`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  return ((d.data ?? []) as Kline[]).reverse()
}

export async function okx1hKlines(instId: string): Promise<Kline[]> {
  const r = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=100`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  return ((d.data ?? []) as Kline[]).reverse()
}

export async function okxDailyKlines(instId: string): Promise<Kline[]> {
  const r = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1D&limit=210`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  return ((d.data ?? []) as Kline[]).reverse()
}

export async function okxFunding(instId: string): Promise<number> {
  const r = await fetch(
    `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return 0
  const d = await r.json()
  return parseFloat(d.data?.[0]?.fundingRate ?? '0')
}

export async function runOKXScan(): Promise<RawResult[]> {
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
  const oiMap   = new Map(oiItems.map(i => [i.instId, parseFloat(i.oiCcy)]))

  const qualified = tickers
    .filter(t => t.instId.endsWith('-USDT-SWAP'))
    .map(t => ({
      instId: t.instId,
      price:  parseFloat(t.last),
      oiUsd:  (oiMap.get(t.instId) ?? 0) * parseFloat(t.last),
    }))
    .filter(t => t.oiUsd > 50_000_000)
    .sort((a, b) => b.oiUsd - a.oiUsd)
    .slice(0, 40)

  const results: RawResult[] = []
  for (let i = 0; i < qualified.length; i += 10) {
    const batch = qualified.slice(i, i + 10)
    const [klineRes, fundingRes, dailyRes] = await Promise.all([
      Promise.allSettled(batch.map(t => okxKlines(t.instId))),
      Promise.allSettled(batch.map(t => okxFunding(t.instId))),
      Promise.allSettled(batch.map(t => okxDailyKlines(t.instId))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const funding = fundingRes[j].status === 'fulfilled'
        ? (fundingRes[j] as PromiseFulfilledResult<number>).value : 0
      const dailyKl = dailyRes[j].status === 'fulfilled'
        ? (dailyRes[j] as PromiseFulfilledResult<Kline[]>).value : []
      const { score, signals, skip } = scoreKlines(kl, dailyKl, t.price, funding)
      if (skip) continue
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

// --- MEXC ---

const MEXC_BASE = 'https://api.mexc.com/api/v1/contract'

type MEXCKlineData = {
  time: number[]
  open: string[]
  high: string[]
  low: string[]
  close: string[]
  vol: string[]
}

export async function mexcKlines(symbol: string, interval: string, lookback: number): Promise<Kline[]> {
  const end   = Math.floor(Date.now() / 1000)
  const intervalSec = interval === 'Hour4' ? 4 * 3600 : interval === 'Min60' ? 3600 : 86400
  const start = end - lookback * intervalSec
  const r = await fetch(
    `${MEXC_BASE}/kline/${symbol}?interval=${interval}&start=${start}&end=${end}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  if (!d.success || !d.data?.time?.length) return []
  const { time, open, high, low, close, vol } = d.data as MEXCKlineData
  // MEXC returns seconds; oldest-first (already ascending)
  return time.map((t, i) => [String(t * 1000), open[i], high[i], low[i], close[i], vol[i]] as Kline)
}

export async function runMEXCScan(): Promise<RawResult[]> {
  const [detailRes, tickerRes] = await Promise.all([
    fetch(`${MEXC_BASE}/detail`,  { cache: 'no-store', headers: HEADERS }),
    fetch(`${MEXC_BASE}/ticker`,  { cache: 'no-store', headers: HEADERS }),
  ])
  if (!detailRes.ok) throw new Error(`MEXC detail HTTP ${detailRes.status}`)
  if (!tickerRes.ok) throw new Error(`MEXC ticker HTTP ${tickerRes.status}`)

  type MEXCDetail = { symbol: string; quoteCoin: string; state: number; contractSize: number; fundingRate: string | number }
  type MEXCTicker = { symbol: string; lastPrice: string | number; holdVol: string | number }

  const [detailJson, tickerJson] = await Promise.all([detailRes.json(), tickerRes.json()])
  if (!detailJson.success || !tickerJson.success) throw new Error('MEXC API returned error')

  const details   = (detailJson.data ?? []) as MEXCDetail[]
  const tickers   = (tickerJson.data  ?? []) as MEXCTicker[]
  const tickerMap = new Map(tickers.map(t => [t.symbol, t]))

  const qualified: Array<{ symbol: string; price: number; oiUsd: number; funding: number }> = []
  for (const d of details) {
    if (d.quoteCoin !== 'USDT' || d.state !== 0) continue
    const ticker = tickerMap.get(d.symbol)
    if (!ticker) continue
    const price = parseFloat(String(ticker.lastPrice))
    if (!price) continue
    const oiUsd = parseFloat(String(ticker.holdVol)) * d.contractSize * price
    if (oiUsd < 50_000_000) continue
    qualified.push({ symbol: d.symbol, price, oiUsd, funding: parseFloat(String(d.fundingRate)) })
  }
  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 40)

  const results: RawResult[] = []
  for (let i = 0; i < top.length; i += 10) {
    const batch = top.slice(i, i + 10)
    const [klineRes, dailyRes] = await Promise.all([
      Promise.allSettled(batch.map(t => mexcKlines(t.symbol, 'Hour4', 210))),
      Promise.allSettled(batch.map(t => mexcKlines(t.symbol, 'Day1',  215))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const dailyKl = dailyRes[j].status === 'fulfilled'
        ? (dailyRes[j] as PromiseFulfilledResult<Kline[]>).value : []
      const { score, signals, skip } = scoreKlines(kl, dailyKl, t.price, t.funding)
      if (skip) continue
      results.push({
        symbol:      t.symbol.replace('_', ''),   // BTC_USDT → BTCUSDT
        price:       t.price,
        oi_usd:      t.oiUsd,
        funding_pct: t.funding * 100,
        score,
        signals,
        exchange:    'mexc',
        scanned_at:  new Date().toISOString(),
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- Hyperliquid ---

export async function hyperliquidKlines(coin: string): Promise<Kline[]> {
  const endTime   = Date.now()
  const startTime = endTime - 210 * 4 * 60 * 60 * 1000
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', cache: 'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '4h', startTime, endTime } }),
  })
  if (!r.ok) return []
  const candles = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  return candles.map(c => [String(c.t), c.o, c.h, c.l, c.c, c.v] as Kline)
}

export async function hyperliquid1hKlines(coin: string): Promise<Kline[]> {
  const endTime   = Date.now()
  const startTime = endTime - 105 * 60 * 60 * 1000
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', cache: 'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1h', startTime, endTime } }),
  })
  if (!r.ok) return []
  const candles = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  return candles.map(c => [String(c.t), c.o, c.h, c.l, c.c, c.v] as Kline)
}

export async function hyperliquidDailyKlines(coin: string): Promise<Kline[]> {
  const endTime   = Date.now()
  const startTime = endTime - 215 * 24 * 60 * 60 * 1000
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', cache: 'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1d', startTime, endTime } }),
  })
  if (!r.ok) return []
  const candles = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  return candles.map(c => [String(c.t), c.o, c.h, c.l, c.c, c.v] as Kline)
}

export async function runHyperliquidScan(): Promise<RawResult[]> {
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', cache: 'no-store',
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
    qualified.push({ coin, price, oiUsd, funding8h: parseFloat(ctx.funding) * 8 })
  }

  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 40)

  const results: RawResult[] = []
  for (let i = 0; i < top.length; i += 10) {
    const batch   = top.slice(i, i + 10)
    const [klineRes, dailyRes] = await Promise.all([
      Promise.allSettled(batch.map(t => hyperliquidKlines(t.coin))),
      Promise.allSettled(batch.map(t => hyperliquidDailyKlines(t.coin))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const dailyKl = dailyRes[j].status === 'fulfilled'
        ? (dailyRes[j] as PromiseFulfilledResult<Kline[]>).value : []
      const { score, signals, skip } = scoreKlines(kl, dailyKl, t.price, t.funding8h)
      if (skip) continue
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

export function applyBtcSentiment(rawScore: number, s: SentimentCondition): {
  adjustedScore: number
  marketCondition: 'favourable' | 'neutral' | 'hostile'
  sentimentFlags: string[]
} {
  const sentimentFlags: string[] = []
  let fav = 0, hos = 0

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
  return {
    adjustedScore:  Math.max(0, Math.min(15, rawScore + delta)),
    marketCondition,
    sentimentFlags,
  }
}

export async function fetchBtcSentimentData(sql: SqlClient): Promise<SentimentCondition> {
  try {
    const [fngRes, domRes, klinesRes, fundingRes] = await Promise.allSettled([
      fetch('https://api.alternative.me/fng/', { cache: 'no-store', headers: HEADERS }),
      fetch('https://api.coingecko.com/api/v3/global', { cache: 'no-store', headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY! } }),
      okxKlines('BTC-USDT-SWAP'),
      okxFunding('BTC-USDT-SWAP'),
    ])

    let fng = 50
    if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
      try { fng = parseInt((await fngRes.value.json()).data?.[0]?.value ?? '50', 10) } catch { /* default */ }
    }

    let btcDominance = 0, domTrend: 'up' | 'down' | 'flat' = 'flat'
    if (domRes.status === 'fulfilled' && domRes.value.ok) {
      try {
        const d = await domRes.value.json()
        btcDominance = d.data?.market_cap_percentage?.btc ?? 0
        await sql`CREATE TABLE IF NOT EXISTS btc_dominance_history (id SERIAL PRIMARY KEY, value FLOAT NOT NULL, recorded_at TIMESTAMPTZ DEFAULT NOW())`
        const prev = await sql`SELECT value FROM btc_dominance_history ORDER BY recorded_at DESC LIMIT 1`
        if (prev.length > 0) {
          const diff = btcDominance - (prev[0].value as number)
          domTrend = diff > 0.2 ? 'up' : diff < -0.2 ? 'down' : 'flat'
        }
        await sql`INSERT INTO btc_dominance_history (value) VALUES (${btcDominance})`
        await sql`DELETE FROM btc_dominance_history WHERE id NOT IN (SELECT id FROM btc_dominance_history ORDER BY recorded_at DESC LIMIT 100)`
      } catch { /* defaults */ }
    }

    let btcStructure: 'bullish' | 'neutral' | 'bearish' = 'neutral'
    if (klinesRes.status === 'fulfilled') {
      const kl = klinesRes.value
      if (kl.length >= 50) {
        const closes = kl.map(k => parseFloat(k[4]))
        const highs  = kl.map(k => parseFloat(k[2]))
        const price  = closes[closes.length - 1]
        const e50    = calcEMA(closes, 50)
        if (highs.length >= 20) {
          const slice  = highs.slice(-20)
          const recent = slice.slice(10).reduce((a, b) => a + b, 0) / 10
          const prior  = slice.slice(0, 10).reduce((a, b) => a + b, 0) / 10
          const lh     = (prior - recent) / prior > 0.02
          if (price < e50[e50.length - 1] && lh) btcStructure = 'bearish'
          else if (price > e50[e50.length - 1])   btcStructure = 'bullish'
        }
      }
    }

    const btcFunding = fundingRes.status === 'fulfilled'
      ? (fundingRes as PromiseFulfilledResult<number>).value : 0

    return { fng, btcDominance, btcFunding, btcStructure, domTrend }
  } catch {
    return { fng: 50, btcDominance: 0, btcFunding: 0, btcStructure: 'neutral', domTrend: 'flat' }
  }
}

// --- Signal history tables ---

export async function setupSignalTables(sql: SqlClient): Promise<void> {
  // If old entries-route scanner_signals exists (wrong schema), migrate it
  await sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scanner_signals' AND column_name = 'entry_price'
      ) THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_alerts'
        ) THEN
          EXECUTE 'ALTER TABLE scanner_signals RENAME TO telegram_alerts';
        ELSE
          EXECUTE 'DROP TABLE scanner_signals';
        END IF;
      END IF;
    END $$
  `

  await sql`
    CREATE TABLE IF NOT EXISTS scanner_signals (
      id               SERIAL PRIMARY KEY,
      symbol           VARCHAR(20)   NOT NULL,
      exchange         VARCHAR(20)   NOT NULL,
      price_at_signal  DECIMAL(20,8) NOT NULL,
      score            INTEGER       NOT NULL,
      raw_score        INTEGER       NOT NULL,
      signals          TEXT[]        NOT NULL,
      market_condition VARCHAR(20)   NOT NULL,
      fng              INTEGER,
      oi_usd           DECIMAL(20,2),
      funding_rate     DECIMAL(10,6),
      scanned_at       TIMESTAMP     DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS scanner_outcomes (
      id          SERIAL PRIMARY KEY,
      signal_id   INTEGER REFERENCES scanner_signals(id),
      hours_after INTEGER       NOT NULL,
      price       DECIMAL(20,8) NOT NULL,
      pct_change  DECIMAL(8,4)  NOT NULL,
      recorded_at TIMESTAMP     DEFAULT NOW()
    )
  `
}

export interface LoggableResult {
  symbol: string
  exchange: string
  price: number
  score: number          // raw score
  adjusted_score: number // BTC-sentiment adjusted
  signals: string[]
  market_condition: string
  fng: number
  oi_usd: number
  funding_pct: number    // already ×100, e.g. 0.01 means 0.01%
}

export async function logSignals(sql: SqlClient, results: LoggableResult[]): Promise<number> {
  let logged = 0
  for (const r of results) {
    if (r.adjusted_score < 5) continue

    const recent = await sql`
      SELECT id FROM scanner_signals
      WHERE  symbol   = ${r.symbol}
        AND  exchange = ${r.exchange}
        AND  scanned_at > NOW() - INTERVAL '4 hours'
      LIMIT 1
    `
    if (recent.length > 0) continue

    // Build Postgres TEXT[] literal — signal names are safe snake_case + symbols
    const signalsLiteral = `{${r.signals.map(s => `"${s}"`).join(',')}}`

    await sql`
      INSERT INTO scanner_signals
        (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition, fng, oi_usd, funding_rate)
      VALUES (
        ${r.symbol}, ${r.exchange}, ${r.price},
        ${r.adjusted_score}, ${r.score},
        ${signalsLiteral}::text[],
        ${r.market_condition},
        ${r.fng}, ${r.oi_usd}, ${r.funding_pct / 100}
      )
    `
    logged++
  }
  return logged
}
