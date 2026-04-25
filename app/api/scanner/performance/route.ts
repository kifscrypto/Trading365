import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export interface SignalRecord {
  id: number
  symbol: string
  exchange: string
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
  winRate: number        // % with 24h drop > 3%
  avgMove24h: number
  bestThreshold: string
}

export interface ChartPoint {
  date: string
  winRate: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const minScore = parseInt(searchParams.get('minScore') ?? '5', 10)
  const exchange = searchParams.get('exchange') ?? 'all'
  const days     = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90)

  const sql = neon(process.env.DATABASE_URL!)

  try {
    const rows = await sql`
      SELECT
        s.id,
        s.symbol,
        s.exchange,
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
      ORDER BY s.scanned_at DESC
    `

    const signals = rows as SignalRecord[]

    // --- Stats ---
    const with24h   = signals.filter(s => s.outcome_24h !== null)
    const wins24h   = with24h.filter(s => (s.outcome_24h as number) < -3)
    const winRate   = with24h.length > 0 ? (wins24h.length / with24h.length) * 100 : 0
    const avgMove24h = with24h.length > 0
      ? with24h.reduce((sum, s) => sum + (s.outcome_24h as number), 0) / with24h.length
      : 0

    let bestThreshold = 'Not enough data'
    let bestWR = -1
    for (const t of [5, 6, 7, 8, 9]) {
      const sub = with24h.filter(s => s.score >= t)
      if (sub.length < 5) continue
      const wr = sub.filter(s => (s.outcome_24h as number) < -3).length / sub.length * 100
      if (wr > bestWR) { bestWR = wr; bestThreshold = `Score ${t}+ wins ${Math.round(wr)}%` }
    }

    const stats: PerfStats = {
      total:        signals.length,
      withOutcome:  with24h.length,
      winRate:      Math.round(winRate * 10) / 10,
      avgMove24h:   Math.round(avgMove24h * 100) / 100,
      bestThreshold,
    }

    // --- Rolling 30-signal win rate chart (ascending order) ---
    const asc = [...with24h].sort(
      (a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    )
    const chartData: ChartPoint[] = asc
      .map((sig, i) => {
        const window  = asc.slice(Math.max(0, i - 29), i + 1)
        const wWins   = window.filter(s => (s.outcome_24h as number) < -3).length
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
