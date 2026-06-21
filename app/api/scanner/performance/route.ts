import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export interface SignalRecord {
  id: number
  symbol: string
  exchange: string
  direction: string
  score: number
  raw_score: number
  signals: string[]
  market_condition: string
  price_at_signal: number
  fng: number | null
  scanned_at: string
  outcome_24h: number | null
  outcome_48h: number | null
  outcome_72h: number | null
}

export interface PerfStats {
  total: number
  withOutcome: number
  winRate: number        // % hitting TP1 within 24h (direction-aware)
  tp1Rate: number
  tp2Rate: number
  tp3Rate: number
  avgMove24h: number
  bestThreshold: string
  regimeFired: number
  regimeSuppressed: number
}

export interface ChartPoint {
  date: string
  winRate: number
}

type Direction = 'short' | 'long' | 'both'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const minScore = parseInt(searchParams.get('minScore') ?? '7', 10)
  const exchange = searchParams.get('exchange') ?? 'all'
  const days     = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90)
  const dParam   = searchParams.get('direction') ?? 'both'
  const direction: Direction = dParam === 'short' || dParam === 'long' ? dParam : 'both'

  const sql = neon(process.env.DATABASE_URL!)

  try {
    // Regime-gated product set, direction-aware:
    //   short → direction='short' AND market_condition='favourable'
    //   long  → direction='long'  AND market_condition='hostile' AND scanned after the rewrite
    //   both  → either of the above
    // The single param-guarded predicate covers all three cases. Long signals are
    // floored at the 2026-06-18 rewrite date so pre-rewrite long signals (a
    // different model) can't pollute the stats; short signals are unaffected.
    const rows = await sql`
      SELECT
        s.id,
        s.symbol,
        s.exchange,
        s.direction,
        s.score,
        s.raw_score,
        s.signals,
        s.market_condition,
        s.price_at_signal::float AS price_at_signal,
        s.fng,
        s.scanned_at,
        o24.pct_change::float AS outcome_24h,
        o48.pct_change::float AS outcome_48h,
        o72.pct_change::float AS outcome_72h
      FROM scanner_signals s
      LEFT JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
      LEFT JOIN scanner_outcomes o48 ON o48.signal_id = s.id AND o48.hours_after = 48
      LEFT JOIN scanner_outcomes o72 ON o72.signal_id = s.id AND o72.hours_after = 72
      WHERE s.scanned_at > NOW() - (${days}::integer * INTERVAL '1 day')
        AND s.score >= ${minScore}
        AND (${exchange} = 'all' OR s.exchange = ${exchange})
        AND (
          (${direction} IN ('short', 'both') AND s.direction = 'short' AND s.market_condition = 'favourable')
          OR
          (${direction} IN ('long', 'both')  AND s.direction = 'long'  AND s.market_condition = 'hostile' AND s.scanned_at > '2026-06-18')
        )
      ORDER BY s.scanned_at DESC
    `

    const signals = rows as SignalRecord[]

    // Direction-aware win test on the 24h move: shorts win when price falls
    // (move <= -mag), longs win when price rises (move >= +mag).
    const isWin = (s: SignalRecord, mag: number): boolean => {
      const m = s.outcome_24h
      if (m === null) return false
      return s.direction === 'long' ? m >= mag : m <= -mag
    }

    const with24h = signals.filter(s => s.outcome_24h !== null)
    const wins24h = with24h.filter(s => isWin(s, 1.5))   // TP1
    const tp2Hits = with24h.filter(s => isWin(s, 2.5))
    const tp3Hits = with24h.filter(s => isWin(s, 4.0))
    const winRate = with24h.length > 0 ? (wins24h.length / with24h.length) * 100 : 0
    const tp1Rate = winRate
    const tp2Rate = with24h.length > 0 ? (tp2Hits.length / with24h.length) * 100 : 0
    const tp3Rate = with24h.length > 0 ? (tp3Hits.length / with24h.length) * 100 : 0
    const avgMove24h = with24h.length > 0
      ? with24h.reduce((sum, s) => sum + (s.outcome_24h as number), 0) / with24h.length
      : 0

    let bestThreshold = 'Not enough data'
    let bestWR = -1
    for (const t of [7, 8, 9]) {
      const sub = with24h.filter(s => s.score >= t)
      if (sub.length < 5) continue
      const wr = sub.filter(s => isWin(s, 1.5)).length / sub.length * 100
      if (wr > bestWR) { bestWR = wr; bestThreshold = `Score ${t}+ wins ${Math.round(wr)}%` }
    }

    // --- Regime filter activity (direction-aware) ---
    // Fired = alerts actually sent; Suppressed = high-score (≥7) watchlist candidates
    // seen in the WRONG regime for that direction. Long tables are guarded — they may
    // not exist until the long crons have run.
    let regimeFired = 0
    let regimeSuppressed = 0

    if (direction === 'short' || direction === 'both') {
      const [f] = await sql`
        SELECT COUNT(*)::int AS n FROM telegram_alerts
        WHERE triggered_at > NOW() - (${days}::integer * INTERVAL '1 day')
          AND (${exchange} = 'all' OR exchange = ${exchange})
      ` as Array<{ n: number }>
      const [s] = await sql`
        SELECT COUNT(*)::int AS n FROM scanner_watchlist
        WHERE created_at > NOW() - (${days}::integer * INTERVAL '1 day')
          AND adjusted_score >= 7
          AND market_condition <> 'favourable'
          AND (${exchange} = 'all' OR exchange = ${exchange})
      ` as Array<{ n: number }>
      regimeFired += f?.n ?? 0
      regimeSuppressed += s?.n ?? 0
    }

    if (direction === 'long' || direction === 'both') {
      try {
        const [f] = await sql`
          SELECT COUNT(*)::int AS n FROM telegram_alerts_long
          WHERE triggered_at > NOW() - (${days}::integer * INTERVAL '1 day')
            AND (${exchange} = 'all' OR exchange = ${exchange})
        ` as Array<{ n: number }>
        regimeFired += f?.n ?? 0
      } catch { /* telegram_alerts_long not created yet */ }
      try {
        const [s] = await sql`
          SELECT COUNT(*)::int AS n FROM scanner_long_watchlist
          WHERE created_at > NOW() - (${days}::integer * INTERVAL '1 day')
            AND adjusted_score >= 7
            AND market_condition <> 'hostile'
            AND (${exchange} = 'all' OR exchange = ${exchange})
        ` as Array<{ n: number }>
        regimeSuppressed += s?.n ?? 0
      } catch { /* scanner_long_watchlist not created yet */ }
    }

    const stats: PerfStats = {
      total:            signals.length,
      withOutcome:      with24h.length,
      winRate:          Math.round(winRate * 10) / 10,
      tp1Rate:          Math.round(tp1Rate * 10) / 10,
      tp2Rate:          Math.round(tp2Rate * 10) / 10,
      tp3Rate:          Math.round(tp3Rate * 10) / 10,
      avgMove24h:       Math.round(avgMove24h * 100) / 100,
      bestThreshold,
      regimeFired,
      regimeSuppressed,
    }

    // --- Rolling 30-signal win rate chart (ascending, direction-aware) ---
    const asc = [...with24h].sort(
      (a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    )
    const chartData: ChartPoint[] = asc
      .map((sig, i) => {
        const window = asc.slice(Math.max(0, i - 29), i + 1)
        const wWins  = window.filter(s => isWin(s, 1.5)).length
        return {
          date:    new Date(sig.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          winRate: Math.round((wWins / window.length) * 100),
        }
      })
      .filter((_, i) => i >= 9) // min 10 signals for a meaningful window

    return NextResponse.json({ signals, stats, chartData })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[performance]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
