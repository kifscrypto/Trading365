import type { Candle, Direction } from '../shared/types'

export function calcEMA(values: number[], period: number): number[] {
  if (!values.length) return []
  const k = 2 / (period + 1)
  const out = [values[0]]
  for (let i = 1; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k)
  return out
}

export function calcRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
}

export function calcMACD(closes: number[]): { macd: number; signal: number } {
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  const line = ema12.map((value, index) => value - ema26[index])
  const signal = calcEMA(line, 9)
  return { macd: line.at(-1) ?? 0, signal: signal.at(-1) ?? 0 }
}

export function swingHigh(candles: Candle[], lookback = 10): number {
  return Math.max(...candles.slice(-lookback).map(candle => candle.high))
}

export function swingLow(candles: Candle[], lookback = 10): number {
  return Math.min(...candles.slice(-lookback).map(candle => candle.low))
}

export function clampStop(entry: number, rawStop: number, direction: Direction): number {
  if (direction === 'long') return Math.min(Math.max(rawStop, entry * .96), entry * .98)
  return Math.max(Math.min(rawStop, entry * 1.04), entry * 1.02)
}

export function targetsFor(entry: number, direction: Direction): number[] {
  const fractions = direction === 'long' ? [1.015, 1.025, 1.04, 1.06, 1.08] : [.985, .975, .96, .94, .92]
  return fractions.map(fraction => entry * fraction)
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}
