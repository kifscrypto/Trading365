/**
 * Shared scanner logic — imported by all three scanner route files.
 * Not a route itself; Next.js only treats route.ts as an API endpoint.
 */
import { neon } from '@neondatabase/serverless'
import { isExcludedSymbol } from './_config'

export type Kline = [string, string, string, string, string, string, ...string[]]
export type SqlClient = ReturnType<typeof neon>

export interface SentimentCondition {
  fng: number
  btcDominance: number
  btcFunding: number
  btcStructure: 'bullish' | 'neutral' | 'bearish'        // 4H price vs EMA50
  btcStructureDaily: 'bullish' | 'neutral' | 'bearish'   // daily price vs EMA200
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
  // 4h trend context computed by the long scorer at scoring time and persisted on
  // the watchlist row, so the long-entries route can reference 4h EMA levels
  // without re-fetching 4h klines. Undefined for shorts (unused).
  ema50_4h?: number | null
  ema200_4h?: number | null
  price_distance_pct?: number | null
  // Protective stop computed at scan time from recent swing extremes (short → last
  // swing high, long → last swing low). Persisted on the signal so the outcome
  // tracker can cap losses at this level. Absolute price, not a percentage.
  stop_price?: number | null
}

/** Shared scorer return shape. Long scorer also emits 4h EMA context. */
export interface ScoreResult {
  score: number
  signals: string[]
  skip: boolean
  ema50_4h?: number | null
  ema200_4h?: number | null
  price_distance_pct?: number | null
}

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
}

const MIN_OI: Record<string, number> = {
  bybit:        20_000_000,
  okx:          20_000_000,
  hyperliquid:  10_000_000,
  mexc:          8_000_000,
  // WEEX + Bitunix expose no reliable public open interest, so for these two the
  // gate is 24h quote (USD) volume instead — a liquidity proxy. See runWEEXScan /
  // runBitunixScan, where oi_usd is populated with the 24h volume.
  weex:          5_000_000,
  bitunix:       5_000_000,
}

/** Per-exchange display label for alerts + UI. */
export const EXCHANGE_LABEL: Record<string, string> = {
  okx:         'OKX',
  hyperliquid: 'Hyperliquid',
  mexc:        'MEXC',
  weex:        'WEEX',
  bitunix:     'Bitunix',
}

/**
 * Deep-link to the perpetual trading page for a signal, by exchange.
 * `symbol` is the stored form, e.g. 'BTCUSDT'.
 */
export function exchangeTradeUrl(exchange: string, symbol: string): string {
  const base = symbol.replace(/USDT$/i, '')
  switch (exchange) {
    case 'hyperliquid': return `https://app.hyperliquid.xyz/trade/${base}`
    case 'mexc':        return `https://futures.mexc.com/exchange/${base}_USDT`
    case 'weex':        return `https://www.weex.com/futures/${base}-USDT`
    case 'bitunix':     return `https://www.bitunix.com/contract-trade/${base}USDT`
    case 'okx':
    default:            return `https://www.okx.com/trade-swap/${base.toLowerCase()}-usdt-swap`
  }
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

const HARD_EXCLUDE = ['BTC', 'ETH', 'XAUT', 'XBT', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME', 'BOME', 'NEIRO', 'POPCAT', 'TURBO', 'GOAT', 'PNUT', 'LUNC', 'DEGEN']

/** Protective stop from recent swing extremes. Short stops above the last swing
 *  high (k[2]); long stops below the last swing low (k[3]). Returns an absolute price. */
export function swingHigh(klines: Kline[], lookback = 10): number {
  return Math.max(...klines.slice(-lookback).map(k => parseFloat(k[2])))
}
export function swingLow(klines: Kline[], lookback = 10): number {
  return Math.min(...klines.slice(-lookback).map(k => parseFloat(k[3])))
}

/**
 * Clamp a protective stop to a 3–6% distance from entry. The raw swing extreme can
 * sit too tight (<3% → stopped out by noise) or too wide (>6% → oversized risk);
 * this bounds it. Longs stop BELOW entry (3–6% below); shorts stop ABOVE (3–6% above).
 * Widened from 2–4% after the Jul 2026 altcoin decoupling event demonstrated that
 * 4% stops were too tight during high-volatility altcoin pumps.
 */
export function clampStop(entry: number, rawStop: number, direction: 'short' | 'long'): number {
  if (direction === 'long') {
    const nearest  = entry * 0.97  // min 3% below entry
    const furthest = entry * 0.94  // max 6% below entry
    return Math.min(Math.max(rawStop, furthest), nearest)
  }
  const nearest  = entry * 1.03    // min 3% above entry
  const furthest = entry * 1.06    // max 6% above entry
  return Math.max(Math.min(rawStop, furthest), nearest)
}

export function scoreKlines(
  symbol: string,
  klines: Kline[],
  dailyKlines: Kline[],
  price: number,
  fundingRate: number
): ScoreResult {
  const base = symbol.replace(/USDT$|USDC$|BUSD$|-USDT|-USDC|_USDT/i, '').toUpperCase()
  if (HARD_EXCLUDE.includes(base) || isExcludedSymbol(symbol)) return { score: 0, signals: [], skip: true }

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

/**
 * LONG scoring — PULLBACK-WITHIN-UPTREND model (Jun 2026 rewrite).
 *
 * Thesis: don't buy strength, buy the dip in a confirmed uptrend. "Daily looks
 * great, 4h temporarily weak, sitting on support → buy the dip not the breakout."
 * The old model rewarded extension (price above 50EMA, higher-highs, rising
 * volume) and bought local tops that mean-reverted (−3.4% avg in the hostile,
 * score≥7 product). This model rewards proximity to support inside an uptrend.
 *
 * Raw factors total ~17; applyBtcSentiment clamps the adjusted score to 15.
 * Scoring/logging threshold stays ≥7 (entry route gates at ≥8). Same inputs as
 * scoreKlines so the scan functions can swap scorers.
 *
 * HARD GATE: daily trend filter is non-negotiable — if we have enough daily
 * candles and price is NOT above the daily trend EMA, the setup is skipped
 * entirely (you do not long a coin in a daily downtrend). The trend EMA is the
 * 200 EMA; for coins with <200 but ≥100 daily candles we fall back to the 100
 * EMA and tag 'reduced_confidence' (no score penalty — flag only).
 *
 * Also emits the 4h ema50/ema200 + price-distance-from-200EMA so the entry route
 * can reference 4h levels without re-fetching 4h klines.
 */
export function scoreLongKlines(
  symbol: string,
  klines: Kline[],
  dailyKlines: Kline[],
  price: number,
  fundingRate: number
): ScoreResult {
  const base = symbol.replace(/USDT$|USDC$|BUSD$|-USDT|-USDC|_USDT/i, '').toUpperCase()
  if (HARD_EXCLUDE.includes(base) || isExcludedSymbol(symbol)) return { score: 0, signals: [], skip: true }

  const signals: string[] = []
  let score = 0
  if (klines.length < 50) return { score, signals, skip: false }

  const closes  = klines.map(k => parseFloat(k[4]))
  const opens   = klines.map(k => parseFloat(k[1]))
  const volumes = klines.map(k => parseFloat(k[5]))

  // 4h EMAs — also returned for the entry route.
  let e50_4h: number | null = null, e200_4h: number | null = null
  if (closes.length >= 50)  { const e = calcEMA(closes, 50);  e50_4h  = e[e.length - 1] }
  if (closes.length >= 200) { const e = calcEMA(closes, 200); e200_4h = e[e.length - 1] }
  const priceDistPct = e200_4h && e200_4h > 0 ? ((price - e200_4h) / e200_4h) * 100 : null
  const ret = (s: ScoreResult): ScoreResult =>
    ({ ...s, ema50_4h: e50_4h, ema200_4h: e200_4h, price_distance_pct: priceDistPct })

  // Are per-window minima strictly ascending across the last n windows? (daily HL)
  const ascendingLows = (vals: number[], seg = 5, n = 3): boolean => {
    if (vals.length < seg * n) return false
    const tail = vals.slice(-seg * n)
    const pts: number[] = []
    for (let i = 0; i < n; i++) pts.push(Math.min(...tail.slice(i * seg, (i + 1) * seg)))
    for (let i = 1; i < n; i++) if (pts[i] <= pts[i - 1]) return false
    return true
  }

  // ── DAILY CONTEXT (0–4) + non-negotiable trend gate ────────────────────────
  // Trend EMA = 200 daily; fall back to 100 daily (reduced_confidence) when a
  // coin is too young for 200 candles. If we have the data and price is below
  // the trend EMA, this is not a valid pullback-in-uptrend → skip.
  if (dailyKlines.length >= 100) {
    const dCloses = dailyKlines.map(k => parseFloat(k[4]))
    const dLows   = dailyKlines.map(k => parseFloat(k[3]))
    const dPrice  = dCloses[dCloses.length - 1]
    const period  = dailyKlines.length >= 200 ? 200 : 100
    if (period === 100) signals.push('reduced_confidence')   // flag only, no penalty
    const dTrend  = calcEMA(dCloses, period)
    const dTrendLast = dTrend[dTrend.length - 1]

    if (dPrice <= dTrendLast) return ret({ score: 0, signals: [], skip: true })  // hard trend gate
    score += 2; signals.push('d_above_trend')

    const dEma50 = calcEMA(dCloses, 50)
    if (dEma50[dEma50.length - 1] > dTrendLast) { score++; signals.push('d_golden') }
    if (ascendingLows(dLows))                   { score++; signals.push('d_higher_lows') }
  }

  // ── 4h PULLBACK ZONE (0–7) ──────────────────────────────────────────────
  // The heart of the model: price has dipped below the 4h 50EMA but is still
  // holding above the 4h 200EMA, close to support, with a soft RSI.
  if (e50_4h !== null && e200_4h !== null && price < e50_4h && price > e200_4h) {
    score += 2; signals.push('pullback_zone')
  }
  if (priceDistPct !== null && priceDistPct > 0) {
    if (priceDistPct <= 3)      { score += 2; signals.push('near_200ema') }
    else if (priceDistPct <= 6) { score += 1; signals.push('above_200ema') }
    // > 6% above 200EMA = too extended for a dip-buy = 0
  }
  if (closes.length >= 18) {
    const rsi = calcRSI(closes)
    if (rsi < 40)      { score += 2; signals.push('rsi_oversold') }
    else if (rsi < 50) { score += 1; signals.push('rsi_soft') }
  }
  // MACD pulling back but still bullish: hist falling while MACD line > 0
  if (closes.length >= 36) {
    const { macd: mNow, signal: sNow } = calcMACD(closes)
    const { macd: mPrev, signal: sPrev } = calcMACD(closes.slice(0, -1))
    const histNow = mNow - sNow, histPrev = mPrev - sPrev
    if (histNow < histPrev && mNow > 0) { score++; signals.push('macd_pullback') }
  }

  // ── VOLUME (0–2) — a healthy pullback comes on FALLING volume ─────────────
  if (volumes.length >= 20) {
    const last  = volumes[volumes.length - 1]
    const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    if (last < avg20) { score++; signals.push('low_vol_pullback') }
  }
  // Declining volume across the last 3 down candles
  if (volumes.length >= 3 && closes.length >= 3) {
    const v = volumes.slice(-3)
    const down = closes.slice(-3).every((c, i) => c < opens[opens.length - 3 + i])
    if (down && v[2] < v[1] && v[1] < v[0]) { score++; signals.push('vol_drying_up') }
  }

  // ── FUNDING (0–2) — longs are cheap when funding is low/negative ──────────
  if (fundingRate < 0)            { score += 2; signals.push('funding_negative') }
  else if (fundingRate < 0.0001)  { score += 1; signals.push('funding_low') }
  // highly positive funding = crowded longs = 0

  // ── CONFLUENCE BONUS (0–2) ────────────────────────────────────────────────
  if (closes.length >= 18 && priceDistPct !== null) {
    const rsi = calcRSI(closes)
    const dailyBullish = signals.includes('d_above_trend')
    if (dailyBullish && rsi < 45 && priceDistPct >= 0 && priceDistPct <= 5) {
      score += 2; signals.push('confluence')
    }
  }

  return ret({ score, signals, skip: false })
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

export async function runOKXScan(direction: 'short' | 'long' = 'short'): Promise<RawResult[]> {
  const scoreFn = direction === 'long' ? scoreLongKlines : scoreKlines
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
    .filter(t => t.oiUsd >= MIN_OI.okx)
    .sort((a, b) => b.oiUsd - a.oiUsd)
    .slice(0, 100)

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
      const { score, signals, skip, ema50_4h, ema200_4h, price_distance_pct } =
        scoreFn(t.instId.replace('-USDT-SWAP', 'USDT'), kl, dailyKl, t.price, funding)
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
        ema50_4h, ema200_4h, price_distance_pct,
        stop_price:  clampStop(t.price, direction === 'long' ? swingLow(kl) : swingHigh(kl), direction),
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

export async function runMEXCScan(direction: 'short' | 'long' = 'short'): Promise<RawResult[]> {
  const scoreFn = direction === 'long' ? scoreLongKlines : scoreKlines
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
    if (oiUsd < MIN_OI.mexc) continue
    qualified.push({ symbol: d.symbol, price, oiUsd, funding: parseFloat(String(d.fundingRate)) })
  }
  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 100)

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
      const { score, signals, skip, ema50_4h, ema200_4h, price_distance_pct } =
        scoreFn(t.symbol, kl, dailyKl, t.price, t.funding)
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
        ema50_4h, ema200_4h, price_distance_pct,
        stop_price:  clampStop(t.price, direction === 'long' ? swingLow(kl) : swingHigh(kl), direction),
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- WEEX ---
// Bitget-derived contract API (capi/v2), fully public/unsigned. Contract symbols
// look like 'cmt_btcusdt'; funding lives in one all-symbols call keyed by
// '<BASE>_<QUOTE>' (e.g. 'BTC_USDT') with a 4h collectCycle, so funding ×2 ≈ 8h
// equivalent to match the other exchanges' thresholds. No reliable public OI, so
// we qualify by 24h quote (USD) volume. Candles come back in a mixed order (the
// live candle is appended last), so we always sort ascending.

const WEEX_BASE = 'https://api-contract.weex.com/capi/v2'

type WeexCandle = [string, string, string, string, string, string, string] // [time, o, h, l, c, baseVol, quoteVol]

async function weexCandles(cmtSymbol: string, granularity: string, limit: number): Promise<Kline[]> {
  const r = await fetch(
    `${WEEX_BASE}/market/candles?symbol=${cmtSymbol}&granularity=${granularity}&limit=${limit}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const rows = await r.json() as WeexCandle[]
  if (!Array.isArray(rows)) return []
  return rows
    .map(c => [c[0], c[1], c[2], c[3], c[4], c[5]] as Kline)
    .sort((a, b) => Number(a[0]) - Number(b[0]))   // oldest-first
}

export function weexKlines(cmtSymbol: string): Promise<Kline[]> {
  return weexCandles(cmtSymbol, '4h', 210)
}

export function weex1hKlines(cmtSymbol: string): Promise<Kline[]> {
  return weexCandles(cmtSymbol, '1h', 105)
}

export function weexDailyKlines(cmtSymbol: string): Promise<Kline[]> {
  return weexCandles(cmtSymbol, '1d', 215)
}

export async function runWEEXScan(direction: 'short' | 'long' = 'short'): Promise<RawResult[]> {
  const scoreFn = direction === 'long' ? scoreLongKlines : scoreKlines
  const [contractRes, tickerRes, fundingRes] = await Promise.all([
    fetch(`${WEEX_BASE}/market/contracts`,     { cache: 'no-store', headers: HEADERS }),
    fetch(`${WEEX_BASE}/market/tickers`,       { cache: 'no-store', headers: HEADERS }),
    fetch(`${WEEX_BASE}/market/funding_rate`,  { cache: 'no-store', headers: HEADERS }),
  ])
  if (!contractRes.ok || !tickerRes.ok) throw new Error(`WEEX HTTP ${contractRes.status}/${tickerRes.status}`)

  type WeexContract = { symbol: string; underlying_index: string; quote_currency: string }
  type WeexTicker   = { symbol: string; last: string; volume_24h: string }
  type WeexFunding  = { baseCurrency: string; fundingRate: string }

  const contracts = await contractRes.json() as WeexContract[]
  const tickers   = await tickerRes.json()   as WeexTicker[]
  const fundings  = fundingRes.ok ? await fundingRes.json() as WeexFunding[] : []

  const tickerMap  = new Map(tickers.map(t => [t.symbol, t]))
  const fundingMap = new Map(fundings.map(f => [f.baseCurrency, parseFloat(f.fundingRate) || 0]))

  const qualified: Array<{ cmt: string; symbol: string; price: number; volUsd: number; funding: number }> = []
  for (const c of contracts) {
    if (c.quote_currency !== 'USDT') continue
    const ticker = tickerMap.get(c.symbol)
    if (!ticker) continue
    const price  = parseFloat(ticker.last)
    const volUsd = parseFloat(ticker.volume_24h)
    if (!price || volUsd < MIN_OI.weex) continue
    // WEEX funding collects every 4h; ×2 ≈ 8h equivalent.
    const funding = (fundingMap.get(`${c.underlying_index}_${c.quote_currency}`) ?? 0) * 2
    qualified.push({ cmt: c.symbol, symbol: `${c.underlying_index}USDT`, price, volUsd, funding })
  }
  qualified.sort((a, b) => b.volUsd - a.volUsd)
  const top = qualified.slice(0, 100)

  const results: RawResult[] = []
  for (let i = 0; i < top.length; i += 10) {
    const batch = top.slice(i, i + 10)
    const [klineRes, dailyRes] = await Promise.all([
      Promise.allSettled(batch.map(t => weexKlines(t.cmt))),
      Promise.allSettled(batch.map(t => weexDailyKlines(t.cmt))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const dailyKl = dailyRes[j].status === 'fulfilled'
        ? (dailyRes[j] as PromiseFulfilledResult<Kline[]>).value : []
      const { score, signals, skip, ema50_4h, ema200_4h, price_distance_pct } =
        scoreFn(t.symbol, kl, dailyKl, t.price, t.funding)
      if (skip) continue
      results.push({
        symbol:      t.symbol,
        price:       t.price,
        oi_usd:      t.volUsd,    // 24h quote volume proxy (WEEX has no public OI)
        funding_pct: t.funding * 100,
        score,
        signals,
        exchange:    'weex',
        scanned_at:  new Date().toISOString(),
        ema50_4h, ema200_4h, price_distance_pct,
        stop_price:  clampStop(t.price, direction === 'long' ? swingLow(kl) : swingHigh(kl), direction),
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- Bitunix ---
// Public/unsigned futures API. Symbols are already in 'BTCUSDT' form. Tickers
// carry 24h quote (USD) volume but no OI, so qualification is volume-based;
// funding is a per-symbol call (8h interval). Klines come back newest-first, so
// we sort ascending.

const BITUNIX_BASE = 'https://fapi.bitunix.com/api/v1/futures/market'

type BitunixCandle = { open: string; high: string; low: string; close: string; baseVol: string; time: string | number }

async function bitunixCandles(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const r = await fetch(
    `${BITUNIX_BASE}/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return []
  const d = await r.json()
  if (d.code !== 0 || !Array.isArray(d.data)) return []
  return (d.data as BitunixCandle[])
    .map(c => [String(c.time), c.open, c.high, c.low, c.close, c.baseVol] as Kline)
    .sort((a, b) => Number(a[0]) - Number(b[0]))   // oldest-first
}

export function bitunixKlines(symbol: string): Promise<Kline[]> {
  return bitunixCandles(symbol, '4h', 200)
}

export function bitunix1hKlines(symbol: string): Promise<Kline[]> {
  return bitunixCandles(symbol, '1h', 105)
}

export function bitunixDailyKlines(symbol: string): Promise<Kline[]> {
  return bitunixCandles(symbol, '1d', 200)
}

export async function bitunixFunding(symbol: string): Promise<number> {
  const r = await fetch(
    `${BITUNIX_BASE}/funding_rate?symbol=${symbol}`,
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return 0
  const d = await r.json()
  if (d.code !== 0) return 0
  return parseFloat(d.data?.fundingRate ?? '0') || 0
}

export async function runBitunixScan(direction: 'short' | 'long' = 'short'): Promise<RawResult[]> {
  const scoreFn = direction === 'long' ? scoreLongKlines : scoreKlines
  const r = await fetch(`${BITUNIX_BASE}/tickers`, { cache: 'no-store', headers: HEADERS })
  if (!r.ok) throw new Error(`Bitunix HTTP ${r.status}`)
  const d = await r.json()
  if (d.code !== 0) throw new Error('Bitunix API returned error')

  type BitunixTicker = { symbol: string; lastPrice: string; last: string; quoteVol: string }
  const tickers = (d.data ?? []) as BitunixTicker[]

  const qualified: Array<{ symbol: string; price: number; volUsd: number }> = []
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue
    const price  = parseFloat(t.lastPrice ?? t.last)
    const volUsd = parseFloat(t.quoteVol)
    if (!price || volUsd < MIN_OI.bitunix) continue
    qualified.push({ symbol: t.symbol, price, volUsd })
  }
  qualified.sort((a, b) => b.volUsd - a.volUsd)
  const top = qualified.slice(0, 100)

  const results: RawResult[] = []
  for (let i = 0; i < top.length; i += 10) {
    const batch = top.slice(i, i + 10)
    const [klineRes, dailyRes, fundingRes] = await Promise.all([
      Promise.allSettled(batch.map(t => bitunixKlines(t.symbol))),
      Promise.allSettled(batch.map(t => bitunixDailyKlines(t.symbol))),
      Promise.allSettled(batch.map(t => bitunixFunding(t.symbol))),
    ])
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j]
      if (klineRes[j].status !== 'fulfilled') continue
      const kl = (klineRes[j] as PromiseFulfilledResult<Kline[]>).value
      if (kl.length < 50) continue
      const dailyKl = dailyRes[j].status === 'fulfilled'
        ? (dailyRes[j] as PromiseFulfilledResult<Kline[]>).value : []
      const funding = fundingRes[j].status === 'fulfilled'
        ? (fundingRes[j] as PromiseFulfilledResult<number>).value : 0
      const { score, signals, skip, ema50_4h, ema200_4h, price_distance_pct } =
        scoreFn(t.symbol, kl, dailyKl, t.price, funding)
      if (skip) continue
      results.push({
        symbol:      t.symbol,
        price:       t.price,
        oi_usd:      t.volUsd,    // 24h quote volume proxy (Bitunix has no public OI)
        funding_pct: funding * 100,
        score,
        signals,
        exchange:    'bitunix',
        scanned_at:  new Date().toISOString(),
        ema50_4h, ema200_4h, price_distance_pct,
        stop_price:  clampStop(t.price, direction === 'long' ? swingLow(kl) : swingHigh(kl), direction),
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

export async function runHyperliquidScan(direction: 'short' | 'long' = 'short'): Promise<RawResult[]> {
  const scoreFn = direction === 'long' ? scoreLongKlines : scoreKlines
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
    if (oiUsd < MIN_OI.hyperliquid) continue
    qualified.push({ coin, price, oiUsd, funding8h: parseFloat(ctx.funding) * 8 })
  }

  qualified.sort((a, b) => b.oiUsd - a.oiUsd)
  const top = qualified.slice(0, 100)

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
      const { score, signals, skip, ema50_4h, ema200_4h, price_distance_pct } =
        scoreFn(t.coin, kl, dailyKl, t.price, t.funding8h)
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
        ema50_4h, ema200_4h, price_distance_pct,
        stop_price:  clampStop(t.price, direction === 'long' ? swingLow(kl) : swingHigh(kl), direction),
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

// --- BTC Sentiment ---

export function applyBtcSentiment(
  rawScore: number,
  s: SentimentCondition,
  direction: 'short' | 'long' = 'short',
): {
  adjustedScore: number
  marketCondition: 'favourable' | 'neutral' | 'hostile'
  sentimentFlags: string[]
} {
  const sentimentFlags: string[] = []
  // Trend-following regime (absolute, from the SHORT perspective): favourable =
  // bearish BTC, hostile = bullish BTC. Structure leads; FNG only confirms. The
  // LABEL is shared by both directions — only the score delta below is inverted
  // for longs — so 'hostile' always means bullish BTC.
  let fav = 0, hos = 0

  // 1) STRUCTURE IS KING — 4H price vs EMA50 sets the primary direction (±3).
  // Weighted higher than all secondary signals combined (±2 max each) so that
  // fear-index, funding, and daily lag can never override a clear structural
  // regime. When the 4H trend is bullish, the market is NOT favourable for
  // shorts regardless of how fearful FNG or bearish the daily EMA200 may be.
  if (s.btcStructure === 'bearish')      { sentimentFlags.push('btc_bearish'); fav += 3 }
  else if (s.btcStructure === 'bullish') { sentimentFlags.push('btc_bullish'); hos += 3 }

  // 2) FNG — CONFIRMATORY ONLY, capped at +1 (no extreme +2 tier). Fear confirms
  //    a bearish trend, greed confirms a bullish one — it never overrides structure.
  if (s.fng <= 35)      { sentimentFlags.push('fng_fear');  fav += 1 }
  else if (s.fng >= 60) { sentimentFlags.push('fng_greed'); hos += 1 }

  // 3) FUNDING — +1 to whichever side.
  if (s.btcFunding > 0.0003)       { sentimentFlags.push('btc_high_longs');  fav += 1 }
  else if (s.btcFunding > 0)       { sentimentFlags.push('btc_pos_funding'); fav += 1 }
  else if (s.btcFunding < -0.0001) { sentimentFlags.push('btc_crowd_short'); hos += 1 }

  // 4) BTC DOMINANCE — +1 to whichever side.
  if (s.domTrend === 'up')        { sentimentFlags.push('dom_rising');  fav += 1 }
  else if (s.domTrend === 'down') { sentimentFlags.push('dom_falling'); hos += 1 }

  // 5) DAILY 200 EMA — higher-timeframe tiebreaker (±1).
  if (s.btcStructureDaily === 'bearish')      { sentimentFlags.push('btc_below_d200'); fav += 1 }
  else if (s.btcStructureDaily === 'bullish') { sentimentFlags.push('btc_above_d200'); hos += 1 }

  const marketCondition: 'favourable' | 'neutral' | 'hostile' =
    hos >= 2 && hos >= fav ? 'hostile' :
    fav >= 2               ? 'favourable' :
                             'neutral'

  // Score delta is inverted by direction: shorts want a 'favourable' (bearish/greedy
  // BTC) regime, longs want a 'hostile' (bullish BTC) regime.
  const delta = direction === 'long'
    ? (marketCondition === 'favourable' ? -2 : marketCondition === 'hostile'    ? 1 : 0)
    : (marketCondition === 'hostile'    ? -2 : marketCondition === 'favourable' ? 1 : 0)
  return {
    adjustedScore:  Math.max(0, Math.min(15, rawScore + delta)),
    marketCondition,
    sentimentFlags,
  }
}

export async function fetchBtcSentimentData(sql: SqlClient): Promise<SentimentCondition> {
  try {
    const [fngRes, domRes, klinesRes, dailyRes, fundingRes] = await Promise.allSettled([
      fetch('https://api.alternative.me/fng/', { cache: 'no-store', headers: HEADERS }),
      fetch('https://api.coingecko.com/api/v3/global', { cache: 'no-store', headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY! } }),
      okxKlines('BTC-USDT-SWAP'),
      okxDailyKlines('BTC-USDT-SWAP'),
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

    // 4H structure — structure is king: price vs EMA50 alone decides direction.
    // (No lower-highs AND-gate: a price below the 50EMA is bearish, full stop.)
    let btcStructure: 'bullish' | 'neutral' | 'bearish' = 'neutral'
    if (klinesRes.status === 'fulfilled') {
      const kl = klinesRes.value
      if (kl.length >= 50) {
        const closes = kl.map(k => parseFloat(k[4]))
        const price  = closes[closes.length - 1]
        const e50    = calcEMA(closes, 50)
        const e50last = e50[e50.length - 1]
        if (price < e50last)      btcStructure = 'bearish'
        else if (price > e50last) btcStructure = 'bullish'
      }
    }

    // Daily structure — higher-timeframe tiebreaker: price vs EMA200 on the daily.
    let btcStructureDaily: 'bullish' | 'neutral' | 'bearish' = 'neutral'
    if (dailyRes.status === 'fulfilled') {
      const dkl = dailyRes.value
      if (dkl.length >= 200) {
        const dCloses = dkl.map(k => parseFloat(k[4]))
        const dPrice  = dCloses[dCloses.length - 1]
        const e200    = calcEMA(dCloses, 200)
        const e200last = e200[e200.length - 1]
        if (dPrice < e200last)      btcStructureDaily = 'bearish'
        else if (dPrice > e200last) btcStructureDaily = 'bullish'
      }
    }

    const btcFunding = fundingRes.status === 'fulfilled'
      ? (fundingRes as PromiseFulfilledResult<number>).value : 0

    return { fng, btcDominance, btcFunding, btcStructure, btcStructureDaily, domTrend }
  } catch {
    return { fng: 50, btcDominance: 0, btcFunding: 0, btcStructure: 'neutral', btcStructureDaily: 'neutral', domTrend: 'flat' }
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
      direction        VARCHAR(10)   NOT NULL DEFAULT 'short',
      scanned_at       TIMESTAMP     DEFAULT NOW()
    )
  `

  // Migration: ensure the direction column exists on pre-existing tables (long/short support)
  await sql`ALTER TABLE scanner_signals ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'short'`
  // Migration: protective stop price (absolute), populated at scan time so the
  // outcome tracker can cap losses at the stop. NULL for pre-migration signals.
  await sql`ALTER TABLE scanner_signals ADD COLUMN IF NOT EXISTS stop_price NUMERIC`

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

  // Migration: flag rows whose loss was capped at the protective stop level.
  await sql`ALTER TABLE scanner_outcomes ADD COLUMN IF NOT EXISTS stopped_out BOOLEAN DEFAULT FALSE`
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
  stop_price?: number | null // protective stop (absolute price), computed at scan time
}

export async function logSignals(
  sql: SqlClient,
  results: LoggableResult[],
  direction: 'short' | 'long' = 'short',
): Promise<number> {
  let logged = 0
  for (const r of results) {
    if (r.adjusted_score < 5) continue

    // Dedupe within direction so a long signal isn't blocked by a recent short
    // (or vice versa) on the same symbol+exchange.
    const recent = await sql`
      SELECT id FROM scanner_signals
      WHERE  symbol    = ${r.symbol}
        AND  exchange  = ${r.exchange}
        AND  direction = ${direction}
        AND  scanned_at > NOW() - INTERVAL '4 hours'
      LIMIT 1
    `
    if (recent.length > 0) continue

    // Build Postgres TEXT[] literal — signal names are safe snake_case + symbols
    const signalsLiteral = `{${r.signals.map(s => `"${s}"`).join(',')}}`

    await sql`
      INSERT INTO scanner_signals
        (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition, fng, oi_usd, funding_rate, direction, stop_price)
      VALUES (
        ${r.symbol}, ${r.exchange}, ${r.price},
        ${r.adjusted_score}, ${r.score},
        ${signalsLiteral}::text[],
        ${r.market_condition},
        ${r.fng}, ${r.oi_usd}, ${r.funding_pct / 100},
        ${direction},
        ${r.stop_price ?? null}
      )
    `
    logged++
  }
  return logged
}
