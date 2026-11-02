import type { Candle, Direction, MarketAsset, ScoreFactor, ScoreResult, Signal } from '../shared/types'
import { average, calcEMA, calcMACD, calcRSI, clampStop, swingHigh, swingLow, targetsFor } from './indicators'

const hardExclude = new Set(['BTC', 'ETH', 'XAUT', 'XBT', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME', 'BOME', 'NEIRO', 'POPCAT', 'TURBO', 'GOAT', 'PNUT', 'LUNC', 'DEGEN'])
const labels: Record<string, string> = {
  ema_distance: 'Distance from 200 EMA', lower_highs: '4H lower highs', bear_volume: 'Bearish volume', funding: 'Funding backdrop', rsi: 'RSI condition', rsi_divergence: 'Bearish RSI divergence', macd: 'MACD momentum', daily: 'Daily structure', daily_trend: 'Daily uptrend gate', pullback: '4H pullback zone', support: 'Near 200 EMA support', macd_pullback: 'Bullish MACD pullback', low_volume: 'Falling pullback volume', confluence: 'Trend confluence', entry: '1H entry triggers',
}

function result(factors: ScoreFactor[], regime: 'uptrend' | 'downtrend' | 'neutral' | 'unknown', side: Direction, ema50: number | null = null, ema200: number | null = null, priceDistance: number | null = null, skip = false): ScoreResult {
  const score = factors.reduce((sum, factor) => sum + factor.points, 0)
  const delta = regime === (side === 'long' ? 'uptrend' : 'downtrend') ? 1 : regime === 'unknown' || regime === 'neutral' ? 0 : -2
  return { score, adjustedScore: Math.max(0, Math.min(15, score + delta)), factors, skip, ema50, ema200, priceDistance }
}

function factor(key: string, points: number, max: number): ScoreFactor {
  return { key, label: labels[key] ?? key, points, max }
}

export function scoreShort(asset: MarketAsset, daily: Candle[], regime: 'uptrend' | 'downtrend' | 'neutral' | 'unknown'): ScoreResult {
  const candles = asset.candles4h
  if (hardExclude.has(asset.symbol)) return result([], regime, 'short', null, null, null, true)
  const factors: ScoreFactor[] = []
  const closes = candles.map(candle => candle.close)
  if (closes.length >= 200) {
    const ema = calcEMA(closes, 200).at(-1)!
    const below = (ema - asset.price) / ema
    const points = below >= .25 ? 2 : below >= .1 ? 1 : 0
    if (points) factors.push(factor('ema_distance', points, 2))
  }
  if (candles.length >= 20) {
    const recent = average(candles.slice(-10).map(candle => candle.high))
    const previous = average(candles.slice(-20, -10).map(candle => candle.high))
    const drop = (previous - recent) / previous
    const points = drop > .03 ? 2 : drop > 0 ? 1 : 0
    if (points) factors.push(factor('lower_highs', points, 2))
  }
  const last50 = candles.slice(-50)
  const bear = last50.filter(candle => candle.close < candle.open)
  const bull = last50.filter(candle => candle.close >= candle.open)
  const ratio = bear.length && bull.length ? average(bear.map(candle => candle.volume)) / average(bull.map(candle => candle.volume)) : 1
  if (ratio > 1) factors.push(factor('bear_volume', ratio > 1.2 ? 2 : 1, 2))
  const fundingPoints = asset.funding > .0005 ? 3 : asset.funding > .0001 ? 2 : asset.funding > 0 ? 1 : 0
  if (fundingPoints) factors.push(factor('funding', fundingPoints, 3))
  const rsi = calcRSI(closes)
  if (rsi < 30) return result(factors, regime, 'short', null, null, null, true)
  if (rsi > 70) factors.push(factor('rsi', 1, 1))
  if (candles.length >= 10) {
    const recentLow = Math.min(...candles.slice(-5).map(candle => candle.low))
    const priorLow = Math.min(...candles.slice(-10, -5).map(candle => candle.low))
    if (recentLow > priorLow && rsi < calcRSI(closes.slice(0, -5))) factors.push(factor('rsi_divergence', 2, 2))
  }
  if (closes.length >= 35) {
    const macd = calcMACD(closes)
    const points = Number(macd.macd < macd.signal) + Number(macd.macd < 0 && macd.signal < 0)
    if (points) factors.push(factor('macd', points, 2))
  }
  if (daily.length >= 200) {
    let points = 0
    const dailyCloses = daily.map(candle => candle.close)
    if (dailyCloses.at(-1)! < calcEMA(dailyCloses, 200).at(-1)!) points++
    const recent = average(daily.slice(-10).map(candle => candle.high))
    const previous = average(daily.slice(-20, -10).map(candle => candle.high))
    if ((previous - recent) / previous > .03) points++
    if (points) factors.push(factor('daily', points, 2))
  }
  return result(factors, regime, 'short')
}

export function scoreLong(asset: MarketAsset, daily: Candle[], regime: 'uptrend' | 'downtrend' | 'neutral' | 'unknown'): ScoreResult {
  const candles = asset.candles4h
  const closes = candles.map(candle => candle.close)
  if (hardExclude.has(asset.symbol) || closes.length < 50) return result([], regime, 'long', null, null, null, true)
  const ema50 = calcEMA(closes, 50).at(-1) ?? null
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200).at(-1)! : null
  const priceDistance = ema200 ? (asset.price - ema200) / ema200 * 100 : null
  if (daily.length >= 100) {
    const dailyCloses = daily.map(candle => candle.close)
    const trend = calcEMA(dailyCloses, daily.length >= 200 ? 200 : 100).at(-1)!
    if (dailyCloses.at(-1)! <= trend) return result([], regime, 'long', ema50, ema200, priceDistance, true)
  }
  const factors: ScoreFactor[] = []
  if (daily.length >= 100) {
    const dailyCloses = daily.map(candle => candle.close)
    const trend = calcEMA(dailyCloses, daily.length >= 200 ? 200 : 100).at(-1)!
    let points = 2
    if (calcEMA(dailyCloses, 50).at(-1)! > trend) points++
    const windows = [daily.slice(-15, -10), daily.slice(-10, -5), daily.slice(-5)].map(window => Math.min(...window.map(candle => candle.low)))
    if (windows[2] > windows[1] && windows[1] > windows[0]) points++
    factors.push(factor('daily_trend', points, 4))
  }
  if (ema50 && ema200 && asset.price < ema50 && asset.price > ema200) factors.push(factor('pullback', 2, 2))
  if (priceDistance !== null && priceDistance > 0 && priceDistance <= 6) factors.push(factor('support', priceDistance <= 3 ? 2 : 1, 2))
  const rsi = calcRSI(closes)
  if (rsi < 50) factors.push(factor('rsi', rsi < 40 ? 2 : 1, 2))
  if (closes.length >= 36) {
    const now = calcMACD(closes), previous = calcMACD(closes.slice(0, -1))
    if (now.macd - now.signal < previous.macd - previous.signal && now.macd > 0) factors.push(factor('macd_pullback', 1, 1))
  }
  let volumePoints = 0
  if (candles.length >= 20 && candles.at(-1)!.volume < average(candles.slice(-20).map(candle => candle.volume))) volumePoints++
  if (candles.length >= 3) {
    const last = candles.slice(-3)
    if (last.every(candle => candle.close < candle.open) && last[2].volume < last[1].volume && last[1].volume < last[0].volume) volumePoints++
  }
  if (volumePoints) factors.push(factor('low_volume', volumePoints, 2))
  const fundingPoints = asset.funding < 0 ? 2 : asset.funding < .0001 ? 1 : 0
  if (fundingPoints) factors.push(factor('funding', fundingPoints, 2))
  if (factors.some(item => item.key === 'daily_trend') && rsi < 45 && priceDistance !== null && priceDistance >= 0 && priceDistance <= 5) factors.push(factor('confluence', 2, 2))
  return result(factors, regime, 'long', ema50, ema200, priceDistance)
}

function shortTriggers(candles: Candle[]): string[] {
  const closes = candles.map(candle => candle.close)
  const now = calcMACD(closes), previous = calcMACD(closes.slice(0, -1))
  const triggers: string[] = []
  if (previous.macd >= previous.signal && now.macd < now.signal) triggers.push('MACD bearish cross')
  const rsi = calcRSI(closes)
  if (rsi < 60 && rsi < calcRSI(closes.slice(0, -3))) triggers.push('RSI falling')
  const last = candles.at(-1), previousCandle = candles.at(-2)
  if (last && previousCandle && previousCandle.close > previousCandle.open && last.close < last.open && last.open >= previousCandle.close && last.close <= previousCandle.open) triggers.push('Bearish engulfing')
  return triggers
}

function longTriggers(candles: Candle[], ema50: number | null, ema200: number | null): string[] {
  const closes = candles.map(candle => candle.close)
  const triggers: string[] = []
  const rsi = calcRSI(closes), previousRsi = calcRSI(closes.slice(0, -3))
  if (previousRsi < 40 && rsi > previousRsi) triggers.push('RSI turning up')
  const last = candles.at(-1), previous = candles.at(-2)
  const engulf = last && previous && previous.close < previous.open && last.close > last.open && last.open <= previous.close && last.close >= previous.open
  if (engulf && ema200 && Math.abs(last.close - ema200) / ema200 <= .05) triggers.push('Bullish engulfing near 200 EMA')
  const bounced = [ema50, ema200].some(level => level && Math.min(...candles.slice(-5).map(candle => candle.low)) <= level * 1.015 && last!.close > level)
  const recentLow = Math.min(...candles.slice(-3).map(candle => candle.low))
  const priorLow = Math.min(...candles.slice(-8, -3).map(candle => candle.low))
  if (bounced && recentLow > priorLow) triggers.push('EMA bounce and higher low')
  return triggers
}

export function evaluateEntry(asset: MarketAsset, daily: Candle[], hourly: Candle[], side: Direction, regime: 'uptrend' | 'downtrend' | 'neutral' | 'unknown', existing: Signal[]): Signal | null {
  if ((side === 'long' && regime !== 'uptrend') || (side === 'short' && regime !== 'downtrend') || hourly.length < 36) return null
  const score = side === 'long' ? scoreLong(asset, daily, regime) : scoreShort(asset, daily, regime)
  if (score.skip || score.adjustedScore < (side === 'long' ? 8 : 7)) return null
  const triggers = side === 'long' ? longTriggers(hourly, score.ema50, score.ema200) : shortTriggers(hourly)
  if (triggers.length < (side === 'long' ? 1 : 2)) return null
  const duplicate = existing.some(signal => signal.symbol === asset.symbol && (signal.status === 'open' || Date.now() - Date.parse(signal.firedAt) < 144e5))
  if (duplicate) return null
  const entry = hourly.at(-1)!.close
  const stop = clampStop(entry, side === 'long' ? swingLow(hourly) : swingHigh(hourly), side)
  const firedAt = new Date().toISOString()
  return {
    id: `${asset.symbol}-${side}-${firedAt}`, symbol: asset.symbol, exchange: asset.exchange, side, entry, stop,
    targets: targetsFor(entry, side), score: score.adjustedScore,
    factors: [...score.factors, factor('entry', triggers.length, side === 'long' ? 3 : 3)],
    entryTriggers: triggers, status: 'open', firedAt, closedAt: null, currentPrice: entry,
    candles1h: hourly, candles4h: asset.candles4h,
  }
}

export function outcomeAtPrice(signal: Signal, price: number): Signal['status'] {
  const stopped = signal.side === 'long' ? price <= signal.stop : price >= signal.stop
  if (stopped) return 'sl'
  for (let index = signal.targets.length - 1; index >= 0; index--) {
    const hit = signal.side === 'long' ? price >= signal.targets[index] : price <= signal.targets[index]
    if (hit) return `tp${index + 1}` as Signal['status']
  }
  return 'open'
}
