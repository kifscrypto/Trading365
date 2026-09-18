/**
 * Pattern-V2 shared feature module (Task 2 / Task 4).
 *
 * Single TypeScript implementation of the four pattern families, used by the
 * shadow-mode scorer. It mirrors `analysis/patterns/features.py` exactly —
 * `analysis/patterns/parity_check.py` runs both against the same cached OHLCV
 * and asserts the numeric outputs agree, so this file cannot drift from the
 * validated research code.
 *
 * POINT-IN-TIME CONTRACT: every feature uses only bars whose CLOSE TIME is
 * <= scannedAt (fully-closed bars). `lastClosedIndex()` is the only function
 * that reaches into a series, and it binary-searches on close times. See
 * `analysis/patterns/FEATURES.md` §0.
 *
 * Deliberately dependency-free (no imports) so it can be executed directly by
 * Node's type stripping as well as bundled by Next.js.
 */

export const PATTERN_VERSION = 'pattern-v2.0'

export const TF_MS: Record<string, number> = { '4h': 4 * 3600 * 1000, '1d': 24 * 3600 * 1000 }
export const TIER_PCT: Record<number, number> = { 1: 1.5, 2: 2.5, 3: 4.0, 4: 6.0, 5: 8.0 }
/** 0.1% taker/side as specified by the research brief => 0.20pp round trip. */
export const FEE_RT_PCT = 0.20
/** The engine's own `taker10bps-v1` model: 0.10% taker + 0.05% slippage/side. */
export const FEE_RT_ENGINE_PCT = 0.30

const MIN_BARS_BB_PCTILE = 120
const MIN_BARS_RANGE_Q = 42
const MIN_BARS_DAILY_EMA = 50
const MIN_BARS_RATIO = 21
const SWING_K = 2

export interface Kline { t: number; o: number; h: number; l: number; c: number; v: number }

export interface Series {
  t: Float64Array
  o: Float64Array
  h: Float64Array
  l: Float64Array
  c: Float64Array
  v: Float64Array
  tfMs: number
}

export function seriesFromKlines(klines: Kline[], tf: '4h' | '1d'): Series {
  const s = [...klines].sort((a, b) => a.t - b.t)
  return {
    t: Float64Array.from(s, k => k.t),
    o: Float64Array.from(s, k => k.o),
    h: Float64Array.from(s, k => k.h),
    l: Float64Array.from(s, k => k.l),
    c: Float64Array.from(s, k => k.c),
    v: Float64Array.from(s, k => k.v),
    tfMs: TF_MS[tf],
  }
}

export function seriesLength(s: Series | null): number { return s ? s.t.length : 0 }

/** EMA mirroring `calcEMA` in app/api/scanner/_core.ts: seed = x[0], recursive. */
export function ema(x: Float64Array, period: number): Float64Array {
  const out = new Float64Array(x.length)
  if (x.length === 0) return out
  const k = 2 / (period + 1)
  out[0] = x[0]
  for (let i = 1; i < x.length; i++) out[i] = x[i] * k + out[i - 1] * (1 - k)
  return out
}

/** Wilder RSI, replicating `calcRSI` in _core.ts. NaN before warmup. */
export function rsiWilder(closes: Float64Array, period = 14): Float64Array {
  const n = closes.length
  const out = new Float64Array(n).fill(NaN)
  if (n < period + 1) return out
  const gains = new Float64Array(n - 1)
  const losses = new Float64Array(n - 1)
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1]
    gains[i - 1] = d > 0 ? d : 0
    losses[i - 1] = d < 0 ? -d : 0
  }
  let ag = 0, al = 0
  for (let i = 0; i < period; i++) { ag += gains[i]; al += losses[i] }
  ag /= period; al /= period
  for (let i = period; i < n; i++) {
    if (i > period) {
      ag = (ag * (period - 1) + gains[i - 1]) / period
      al = (al * (period - 1) + losses[i - 1]) / period
    }
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return out
}

/** Wilder ATR. NaN before `period` bars. */
export function atrWilder(h: Float64Array, l: Float64Array, c: Float64Array, period = 14): Float64Array {
  const n = c.length
  const out = new Float64Array(n).fill(NaN)
  if (n < period + 1) return out
  const tr = new Float64Array(n - 1)
  for (let i = 1; i < n; i++) {
    tr[i - 1] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))
  }
  let atr = 0
  for (let i = 0; i < period; i++) atr += tr[i]
  atr /= period
  out[period] = atr
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i - 1]) / period
    out[i] = atr
  }
  return out
}

function rollingMean(x: Float64Array, n: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    sum += x[i]
    if (i >= n) sum -= x[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

/** Population std (ddof=0) — the Bollinger convention. */
function rollingStd(x: Float64Array, n: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN)
  const m = rollingMean(x, n)
  let sumSq = 0
  for (let i = 0; i < x.length; i++) {
    sumSq += x[i] * x[i]
    if (i >= n) sumSq -= x[i - n] * x[i - n]
    if (i >= n - 1) {
      const mean = m[i]
      const v = Math.max(sumSq / n - mean * mean, 0)
      out[i] = Math.sqrt(v)
    }
  }
  return out
}

/** Newest bar whose CLOSE TIME <= scannedMs, or -1. The single PIT gate. */
export function lastClosedIndex(s: Series | null, scannedMs: number): number {
  if (!s || s.t.length === 0) return -1
  return lastIndexLE(Float64Array.from(s.t, t => t + s.tfMs), scannedMs)
}

/** Index of the newest value in an ascending array that is <= x, or -1. */
function lastIndexLE(arr: Float64Array, x: number): number {
  let lo = 0, hi = arr.length - 1, res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= x) { res = mid; lo = mid + 1 } else hi = mid - 1
  }
  return res
}

/** Percentile rank (0-100) of `cur` in `window`, inclusive of the current bar. */
function pctile(window: Float64Array, from: number, to: number, cur: number): number {
  if (!Number.isFinite(cur)) return NaN
  let n = 0, le = 0
  for (let i = from; i <= to; i++) {
    const v = window[i]
    if (!Number.isFinite(v)) continue
    n++; if (v <= cur) le++
  }
  return n === 0 ? NaN : (le / n) * 100
}

/** Fractal pivots, k bars either side. A pivot at i is confirmed only at i+k. */
function swingIndices(h: Float64Array, l: Float64Array, k = SWING_K): { hi: number[]; lo: number[] } {
  const n = h.length
  const hi: number[] = [], lo: number[] = []
  for (let i = k; i < n - k; i++) {
    let isHi = true, isLo = true
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue
      if (h[j] >= h[i]) isHi = false
      if (l[j] <= l[i]) isLo = false
    }
    if (isHi) hi.push(i)
    if (isLo) lo.push(i)
  }
  return { hi, lo }
}

/**
 * UTC-aligned daily closes built from a 4H series (the bar that closes at
 * midnight UTC). Venue-native daily bars are NOT used for the alt/BTC ratio:
 * OKX's daily bars are aligned to 00:00 UTC+8 while the others use 00:00 UTC,
 * and mixing the two would smuggle an 8h look-ahead into the ratio.
 */
function utcDailyClose(s4: Series): { ct: Float64Array; c: Float64Array } {
  const ct: number[] = [], c: number[] = []
  for (let i = 0; i < s4.t.length; i++) {
    const closeT = s4.t[i] + s4.tfMs
    if (closeT % 86_400_000 === 0) { ct.push(closeT); c.push(s4.c[i]) }
  }
  return { ct: Float64Array.from(ct), c: Float64Array.from(c) }
}

/** Ratio on bars whose close times match exactly (no forward-fill). */
function alignedRatio(ctA: Float64Array, a: Float64Array, ctB: Float64Array, b: Float64Array) {
  const mapB = new Map<number, number>()
  for (let i = 0; i < ctB.length; i++) mapB.set(ctB[i], b[i])
  const ct: number[] = [], r: number[] = []
  for (let i = 0; i < ctA.length; i++) {
    const bv = mapB.get(ctA[i])
    if (bv !== undefined && bv !== 0) { ct.push(ctA[i]); r.push(a[i] / bv) }
  }
  return { ct: Float64Array.from(ct), ratio: Float64Array.from(r) }
}

export interface Prep {
  s4: Series | null
  s1: Series | null
  btc4: Series
  btc1: Series
  bbw: Float64Array
  atrp: Float64Array
  rng: Float64Array
  rsi4: Float64Array
  z20: Float64Array
  ema20_1: Float64Array
  ema50_1: Float64Array
  sma20_1: Float64Array
  atr14_1: Float64Array
  swingHi: number[]
  swingLo: number[]
  ratio4Ct: Float64Array
  ratio4: Float64Array
  ratio1Ct: Float64Array
  ratio1: Float64Array
}

const EMPTY = new Float64Array(0)

export function prepSymbol(s4: Series | null, s1: Series | null, btc4: Series, btc1: Series): Prep {
  const p: Prep = {
    s4, s1, btc4, btc1,
    bbw: EMPTY, atrp: EMPTY, rng: EMPTY, rsi4: EMPTY, z20: EMPTY,
    ema20_1: EMPTY, ema50_1: EMPTY, sma20_1: EMPTY, atr14_1: EMPTY,
    swingHi: [], swingLo: [],
    ratio4Ct: EMPTY, ratio4: EMPTY, ratio1Ct: EMPTY, ratio1: EMPTY,
  }
  if (s4 && s4.t.length >= 21) {
    const mean20 = rollingMean(s4.c, 20)
    const std20 = rollingStd(s4.c, 20)
    p.bbw = new Float64Array(s4.t.length)
    p.z20 = new Float64Array(s4.t.length)
    for (let i = 0; i < s4.t.length; i++) {
      p.bbw[i] = mean20[i] > 0 ? (4 * std20[i]) / mean20[i] : NaN
      p.z20[i] = std20[i] > 0 ? (s4.c[i] - mean20[i]) / std20[i] : NaN
    }
    const atr = atrWilder(s4.h, s4.l, s4.c, 14)
    p.atrp = new Float64Array(s4.t.length)
    p.rng = new Float64Array(s4.t.length)
    for (let i = 0; i < s4.t.length; i++) {
      p.atrp[i] = (atr[i] / s4.c[i]) * 100
      p.rng[i] = (s4.h[i] - s4.l[i]) / s4.c[i]
    }
    p.rsi4 = rsiWilder(s4.c, 14)
    const r4 = alignedRatio(
      Float64Array.from(s4.t, t => t + s4.tfMs), s4.c,
      Float64Array.from(btc4.t, t => t + btc4.tfMs), btc4.c)
    p.ratio4Ct = r4.ct; p.ratio4 = r4.ratio
    const sd = utcDailyClose(s4)
    const bd = utcDailyClose(btc4)
    const r1 = alignedRatio(sd.ct, sd.c, bd.ct, bd.c)
    p.ratio1Ct = r1.ct; p.ratio1 = r1.ratio
  }
  if (s1 && s1.t.length >= 51) {
    p.ema20_1 = ema(s1.c, 20)
    p.ema50_1 = ema(s1.c, 50)
    p.sma20_1 = rollingMean(s1.c, 20)
    p.atr14_1 = atrWilder(s1.h, s1.l, s1.c, 14)
    const sw = swingIndices(s1.h, s1.l, SWING_K)
    p.swingHi = sw.hi; p.swingLo = sw.lo
  }
  return p
}

export interface PatternFeatures {
  side: string
  bars_4h_available: number
  bars_1d_available: number
  a_bb_width_pctile: number
  a_atr_pctile: number
  a_window_bars: number
  a_range: number
  a_range_contraction: boolean
  a_squeeze: boolean
  b_ema20: number
  b_ema50: number
  b_trend_up: boolean
  b_trend_down: boolean
  b_hh: boolean
  b_hl: boolean
  b_struct_up: boolean
  b_struct_down: boolean
  b_aligned: boolean
  b_counter: boolean
  b_align_struct: boolean
  c_sym_chg_24h: number
  c_btc_chg_24h: number
  c_rel_perf_24h: number
  c_ratio_trend_4h: number
  c_ratio_vs_sma20_4h: number
  c_ratio_trend_1d: number
  c_ratio_vs_sma20_1d: number
  c_weak_vs_btc: boolean
  c_strong_vs_btc: boolean
  c_bear_div: boolean
  c_bull_div: boolean
  c_aligned: boolean
  c_counter: boolean
  d_dist_20d_atr: number
  d_rsi14_4h: number
  d_zscore20_4h: number
  d_overbought: boolean
  d_oversold: boolean
  d_extreme: boolean
  d_extreme_against: boolean
}

function meanRange(x: Float64Array, from: number, to: number): number {
  let s = 0
  for (let i = from; i <= to; i++) s += x[i]
  return s / (to - from + 1)
}

export function computePatternFeatures(
  side: 'long' | 'short', scannedMs: number, p: Prep,
): PatternFeatures {
  const s4 = p.s4, s1 = p.s1
  const i4 = lastClosedIndex(s4, scannedMs)
  const i1 = lastClosedIndex(s1, scannedMs)
  const f: PatternFeatures = {
    side,
    bars_4h_available: i4 + 1, bars_1d_available: i1 + 1,
    a_bb_width_pctile: NaN, a_atr_pctile: NaN, a_window_bars: 0, a_range: NaN,
    a_range_contraction: false, a_squeeze: false,
    b_ema20: NaN, b_ema50: NaN, b_trend_up: false, b_trend_down: false,
    b_hh: false, b_hl: false, b_struct_up: false, b_struct_down: false,
    b_aligned: false, b_counter: false, b_align_struct: false,
    c_sym_chg_24h: NaN, c_btc_chg_24h: NaN, c_rel_perf_24h: NaN,
    c_ratio_trend_4h: NaN, c_ratio_vs_sma20_4h: NaN, c_ratio_trend_1d: NaN,
    c_ratio_vs_sma20_1d: NaN,
    c_weak_vs_btc: false, c_strong_vs_btc: false, c_bear_div: false, c_bull_div: false,
    c_aligned: false, c_counter: false,
    d_dist_20d_atr: NaN, d_rsi14_4h: NaN, d_zscore20_4h: NaN,
    d_overbought: false, d_oversold: false, d_extreme: false, d_extreme_against: false,
  }

  // ── FAMILY A ────────────────────────────────────────────────────────────
  if (s4 && i4 >= 0 && p.bbw.length === s4.t.length) {
    const n = Math.min(540, i4 + 1)
    f.a_window_bars = n
    if (n >= MIN_BARS_BB_PCTILE) {
      f.a_bb_width_pctile = pctile(p.bbw, i4 - n + 1, i4, p.bbw[i4])
      f.a_atr_pctile = pctile(p.atrp, i4 - n + 1, i4, p.atrp[i4])
    }
    f.a_range = p.rng[i4]
    if (i4 + 1 >= MIN_BARS_RANGE_Q) {
      const w = Array.from(p.rng.slice(i4 - MIN_BARS_RANGE_Q + 1, i4 + 1))
        .filter(Number.isFinite).sort((a, b) => a - b)
      if (w.length) {
        // Linear-interpolated 20th percentile — matches numpy.nanpercentile.
        const pos = 0.2 * (w.length - 1)
        const lower = Math.floor(pos)
        const upper = Math.min(w.length - 1, lower + 1)
        const thr = w[lower] + (pos - lower) * (w[upper] - w[lower])
        f.a_range_contraction = p.rng[i4] <= thr
      }
    }
    f.a_squeeze = (Number.isFinite(f.a_bb_width_pctile) && f.a_bb_width_pctile <= 20)
      || (Number.isFinite(f.a_atr_pctile) && f.a_atr_pctile <= 20)
  }

  // ── FAMILY B ────────────────────────────────────────────────────────────
  if (s1 && i1 >= MIN_BARS_DAILY_EMA && p.ema50_1.length === s1.t.length) {
    f.b_ema20 = p.ema20_1[i1]
    f.b_ema50 = p.ema50_1[i1]
    f.b_trend_up = f.b_ema20 > f.b_ema50
    f.b_trend_down = f.b_ema20 < f.b_ema50
    const sh = p.swingHi.filter(i => i + SWING_K <= i1).slice(-10)
    const sl = p.swingLo.filter(i => i + SWING_K <= i1).slice(-10)
    if (sh.length >= 2) f.b_hh = s1.h[sh[sh.length - 1]] > s1.h[sh[sh.length - 2]]
    if (sl.length >= 2) f.b_hl = s1.l[sl[sl.length - 1]] > s1.l[sl[sl.length - 2]]
    f.b_struct_up = f.b_hh && f.b_hl
    f.b_struct_down = sh.length >= 2 && sl.length >= 2
      && s1.h[sh[sh.length - 1]] < s1.h[sh[sh.length - 2]]
      && s1.l[sl[sl.length - 1]] < s1.l[sl[sl.length - 2]]
    f.b_aligned = (side === 'long' && f.b_trend_up) || (side === 'short' && f.b_trend_down)
    f.b_counter = (side === 'long' && f.b_trend_down) || (side === 'short' && f.b_trend_up)
    f.b_align_struct = (side === 'long' && f.b_struct_up) || (side === 'short' && f.b_struct_down)
  }

  // ── FAMILY C ────────────────────────────────────────────────────────────
  const j4 = lastClosedIndex(p.btc4, scannedMs)
  if (s4 && i4 >= 6 && j4 >= 6) {
    const sym24 = s4.c[i4] / s4.c[i4 - 6] - 1
    const btc24 = p.btc4.c[j4] / p.btc4.c[j4 - 6] - 1
    f.c_sym_chg_24h = sym24 * 100
    f.c_btc_chg_24h = btc24 * 100
    f.c_rel_perf_24h = (sym24 - btc24) * 100
    const rel = f.c_rel_perf_24h
    f.c_weak_vs_btc = rel < 0
    f.c_strong_vs_btc = rel > 0
    f.c_bear_div = f.c_sym_chg_24h > 0 && rel < 0
    f.c_bull_div = f.c_sym_chg_24h < 0 && rel > 0
    f.c_aligned = (side === 'short' && rel < 0) || (side === 'long' && rel > 0)
    f.c_counter = (side === 'short' && rel > 0) || (side === 'long' && rel < 0)
  }
  if (p.ratio4.length) {
    const k = lastIndexLE(p.ratio4Ct, scannedMs)
    if (k >= MIN_BARS_RATIO - 1) {
      f.c_ratio_trend_4h = (p.ratio4[k] / p.ratio4[k - 6] - 1) * 100
      f.c_ratio_vs_sma20_4h = (p.ratio4[k] / meanRange(p.ratio4, k - 19, k) - 1) * 100
    }
  }
  if (p.ratio1.length) {
    const m = lastIndexLE(p.ratio1Ct, scannedMs)
    if (m >= MIN_BARS_RATIO - 1) {
      f.c_ratio_trend_1d = (p.ratio1[m] / p.ratio1[m - 5] - 1) * 100
      f.c_ratio_vs_sma20_1d = (p.ratio1[m] / meanRange(p.ratio1, m - 19, m) - 1) * 100
    }
  }

  // ── FAMILY D ────────────────────────────────────────────────────────────
  if (s4 && i4 >= 0) {
    if (p.rsi4.length === s4.t.length) f.d_rsi14_4h = p.rsi4[i4]
    if (p.z20.length === s4.t.length) f.d_zscore20_4h = p.z20[i4]
    if (s1 && i1 >= 0 && p.atr14_1.length === s1.t.length
      && Number.isFinite(p.sma20_1[i1]) && Number.isFinite(p.atr14_1[i1]) && p.atr14_1[i1] > 0) {
      f.d_dist_20d_atr = (s4.c[i4] - p.sma20_1[i1]) / p.atr14_1[i1]
    }
  }
  const rsi = f.d_rsi14_4h, z = f.d_zscore20_4h, dist = f.d_dist_20d_atr
  const over = (Number.isFinite(rsi) && rsi > 70) || (Number.isFinite(z) && z > 1.5)
    || (Number.isFinite(dist) && dist > 1.5)
  const under = (Number.isFinite(rsi) && rsi < 30) || (Number.isFinite(z) && z < -1.5)
    || (Number.isFinite(dist) && dist < -1.5)
  f.d_overbought = over
  f.d_oversold = under
  if (side === 'long') { f.d_extreme = under; f.d_extreme_against = over }
  else { f.d_extreme = over; f.d_extreme_against = under }
  return f
}

export interface LadderOutcome {
  ladder_tier_seq: number
  ladder_stop_seq: boolean
  ladder_move_seq: number
  ladder_mfe_pct: number
  ladder_mae_pct: number
  ladder_bars: number
  ladder_window_complete: boolean
}

/**
 * Ordering-aware extended-ladder counterfactual (mirror of features.py).
 * Walks the post-scan window bar by bar, banks the deepest tier touched and
 * stops watching when the protective stop is breached. Within one bar the stop
 * wins (pessimistic). This is a research label only — the shadow scorer does not
 * need it, but keeping it here makes the parity check meaningful.
 */
export function ladderOutcome(
  side: 'long' | 'short', scannedMs: number, entry: number, stop: number | null,
  s4: Series | null, horizonH = 24,
): LadderOutcome {
  const out: LadderOutcome = {
    ladder_tier_seq: 0, ladder_stop_seq: false, ladder_move_seq: NaN,
    ladder_mfe_pct: NaN, ladder_mae_pct: NaN, ladder_bars: 0, ladder_window_complete: false,
  }
  if (!s4 || !Number.isFinite(entry) || entry <= 0) return out
  const windowEnd = scannedMs + horizonH * 3_600_000
  const idx: number[] = []
  for (let i = 0; i < s4.t.length; i++) {
    if (s4.t[i] + s4.tfMs > scannedMs && s4.t[i] < windowEnd) idx.push(i)
  }
  if (!idx.length) return out
  out.ladder_bars = idx.length
  out.ladder_window_complete = s4.t[idx[idx.length - 1]] + s4.tfMs >= windowEnd
  let hi = -Infinity, lo = Infinity
  for (const i of idx) { if (s4.h[i] > hi) hi = s4.h[i]; if (s4.l[i] < lo) lo = s4.l[i] }
  const hiExc = ((hi - entry) / entry) * 100
  const loExc = ((entry - lo) / entry) * 100
  out.ladder_mfe_pct = side === 'long' ? hiExc : loExc
  out.ladder_mae_pct = side === 'long' ? loExc : hiExc
  const stopPct = stop != null && Number.isFinite(stop) && stop > 0
    ? (Math.abs(stop - entry) / entry) * 100 : NaN
  let tier = 0, stopped = false
  for (const i of idx) {
    const barFav = side === 'long' ? ((s4.h[i] - entry) / entry) * 100 : ((entry - s4.l[i]) / entry) * 100
    const barAdv = side === 'long' ? ((entry - s4.l[i]) / entry) * 100 : ((s4.h[i] - entry) / entry) * 100
    if (Number.isFinite(stopPct) && barAdv >= stopPct) { stopped = true; break }
    for (const k of [1, 2, 3, 4, 5]) if (barFav >= TIER_PCT[k] && k > tier) tier = k
  }
  out.ladder_tier_seq = tier
  out.ladder_stop_seq = stopped
  out.ladder_move_seq = tier > 0 ? TIER_PCT[tier] : (stopped ? -stopPct : 0)
  return out
}

// ── venue kline loaders (same public endpoints the live scanner uses) ───────
// Used by the shadow scorer only. They never touch production tables.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
}

const baseOf = (s: string) => s.replace(/USDT$/i, '')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function okxSeries(symbol: string, tf: '4h' | '1d', fromMs: number): Promise<Kline[]> {
  const instId = `${baseOf(symbol)}-USDT-SWAP`
  const bar = tf === '4h' ? '4H' : '1D'
  const seen = new Map<number, Kline>()
  let after = Date.now()
  for (let page = 0; page < 12; page++) {
    const url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=${bar}&after=${Math.floor(after)}&limit=100`
    const r = await fetch(url, { cache: 'no-store', headers: HEADERS })
    if (!r.ok) throw new Error(`OKX HTTP ${r.status}`)
    const j = await r.json() as { code: string; data?: string[][] }
    if (j.code !== '0' || !j.data?.length) break
    for (const c of j.data) {
      const t = +c[0]
      if (t >= fromMs) seen.set(t, { t, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })
    }
    const oldest = Math.min(...j.data.map(c => +c[0]))
    if (oldest >= after || oldest <= fromMs) break
    after = oldest
    await sleep(150)
  }
  return [...seen.values()].sort((a, b) => a.t - b.t)
}

async function hyperliquidSeries(symbol: string, tf: '4h' | '1d', fromMs: number): Promise<Kline[]> {
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', cache: 'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin: baseOf(symbol), interval: tf, startTime: fromMs, endTime: Date.now() } }),
  })
  if (!r.ok) throw new Error(`HL HTTP ${r.status}`)
  const j = await r.json() as Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
  if (!Array.isArray(j)) return []
  return j.map(c => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v })).sort((a, b) => a.t - b.t)
}

async function mexcSeries(symbol: string, tf: '4h' | '1d', fromMs: number): Promise<Kline[]> {
  const sym = `${baseOf(symbol)}_USDT`
  const interval = tf === '4h' ? 'Hour4' : 'Day1'
  const url = `https://api.mexc.com/api/v1/contract/kline/${sym}?interval=${interval}` +
    `&start=${Math.floor(fromMs / 1000)}&end=${Math.floor(Date.now() / 1000)}`
  const r = await fetch(url, { cache: 'no-store', headers: HEADERS })
  if (r.status === 400 || r.status === 404) return []
  if (!r.ok) throw new Error(`MEXC HTTP ${r.status}`)
  const j = await r.json() as { success: boolean; data?: { time: number[]; open: string[]; high: string[]; low: string[]; close: string[]; vol: string[] } }
  if (!j.success || !j.data?.time?.length) return []
  const { time, open, high, low, close, vol } = j.data
  return time.map((t, i) => ({ t: t * 1000, o: +open[i], h: +high[i], l: +low[i], c: +close[i], v: +vol[i] }))
    .sort((a, b) => a.t - b.t)
}

async function weexSeries(symbol: string, tf: '4h' | '1d'): Promise<Kline[]> {
  // WEEX caps `limit` at 1000 and ignores start/end time — a documented gap.
  const sym = `cmt_${symbol.toLowerCase()}`
  const r = await fetch(`https://api-contract.weex.com/capi/v2/market/candles?symbol=${sym}&granularity=${tf}&limit=1000`,
    { cache: 'no-store', headers: HEADERS })
  if (r.status === 400 || r.status === 404) return []
  if (!r.ok) throw new Error(`WEEX HTTP ${r.status}`)
  const j = await r.json() as string[][]
  if (!Array.isArray(j)) return []
  return j.map(c => ({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })).sort((a, b) => a.t - b.t)
}

async function bitunixSeries(symbol: string, tf: '4h' | '1d', fromMs: number): Promise<Kline[]> {
  const rows = new Map<number, Kline>()
  let end = Date.now()
  for (let page = 0; page < 12; page++) {
    const url = `https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${symbol}&interval=${tf}&limit=200&endTime=${Math.floor(end)}`
    const r = await fetch(url, { cache: 'no-store', headers: HEADERS })
    if (r.status === 400 || r.status === 404) break
    if (!r.ok) throw new Error(`Bitunix HTTP ${r.status}`)
    const j = await r.json() as { code: number; data?: Array<{ time: string; open: string; high: string; low: string; close: string; baseVol: string }> }
    if (j.code !== 0 || !j.data?.length) break
    for (const c of j.data) {
      const t = +c.time
      if (t >= fromMs) rows.set(t, { t, o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.baseVol })
    }
    const oldest = Math.min(...j.data.map(c => +c.time))
    if (j.data.length < 2 || oldest <= fromMs) break
    end = oldest - 1
    await sleep(120)
  }
  return [...rows.values()].sort((a, b) => a.t - b.t)
}

export async function fetchKlines(exchange: string, symbol: string, tf: '4h' | '1d',
                                  fromMs: number): Promise<Kline[]> {
  switch (exchange) {
    case 'hyperliquid': return hyperliquidSeries(symbol, tf, fromMs)
    case 'mexc': return mexcSeries(symbol, tf, fromMs)
    case 'weex': return weexSeries(symbol, tf)
    case 'bitunix': return bitunixSeries(symbol, tf, fromMs)
    default: return okxSeries(symbol, tf, fromMs)
  }
}

/** 100 days of 4H (~600 bars) and 130 daily bars clear every family's warmup. */
export const LOOKBACK_MS: Record<string, number> = {
  '4h': 100 * 24 * 3600 * 1000,
  '1d': 130 * 24 * 3600 * 1000,
}

/** Load the symbol + BTC series needed to score one candidate, then prep them. */
export async function loadPrep(exchange: string, symbol: string): Promise<Prep> {
  const now = Date.now()
  const [s4, s1, btc4, btc1] = await Promise.all([
    fetchKlines(exchange, symbol, '4h', now - LOOKBACK_MS['4h']),
    fetchKlines(exchange, symbol, '1d', now - LOOKBACK_MS['1d']),
    fetchKlines('okx', 'BTCUSDT', '4h', now - LOOKBACK_MS['4h']),
    fetchKlines('okx', 'BTCUSDT', '1d', now - LOOKBACK_MS['1d']),
  ])
  return prepSymbol(
    s4.length ? seriesFromKlines(s4, '4h') : null,
    s1.length ? seriesFromKlines(s1, '1d') : null,
    seriesFromKlines(btc4, '4h'),
    seriesFromKlines(btc1, '1d'),
  )
}


