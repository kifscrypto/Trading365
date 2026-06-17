import { neon } from "@neondatabase/serverless"

// Shared scanner stats + recent-wins, used by the homepage hero and the two
// scanner pages so the advertised numbers can never diverge. The SQL is copied
// verbatim from app/scanner/page.tsx (short) and app/scanner/longs/page.tsx
// (long) — note the two sides are deliberately asymmetric: short filters by
// market_condition='favourable', long filters by direction='long'.

export type ScannerSide = "short" | "long"

export interface ScannerStats {
  tp1WinRate: number | null
  directionalAccuracy: number | null
  totalSignals: number
  signalsConfirmed: number
  avgMove: number | null
}

export interface ScannerRecentWin {
  side: ScannerSide
  symbol: string
  exchange: string
  pctChange: number
  tp?: number // short side only: highest target reached (1, 2 or 3)
  scannedAt: string
}

const EMPTY_STATS: ScannerStats = {
  tp1WinRate: null,
  directionalAccuracy: null,
  totalSignals: 0,
  signalsConfirmed: 0,
  avgMove: null,
}

export async function getScannerStats(side: ScannerSide): Promise<ScannerStats> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const aggRows = side === "short"
      ? await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change IS NOT NULL
          )::int AS filtered_with_24h,
          COUNT(*) FILTER (
            WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change <= -1.5
          )::int AS tp1_hits,
          COUNT(*) FILTER (
            WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change < 0
          )::int AS dir_hits,
          AVG(o24.pct_change) FILTER (
            WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change IS NOT NULL
          )::float AS avg_move,
          (SELECT COUNT(*)::int FROM scanner_signals) AS total_all
        FROM scanner_signals s
        LEFT JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
      `
      : await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE s.market_condition = 'hostile' AND s.score >= 7 AND o24.pct_change IS NOT NULL
          )::int AS filtered_with_24h,
          COUNT(*) FILTER (
            WHERE s.market_condition = 'hostile' AND s.score >= 7 AND o24.pct_change >= 1.5
          )::int AS tp1_hits,
          COUNT(*) FILTER (
            WHERE s.market_condition = 'hostile' AND s.score >= 7 AND o24.pct_change > 0
          )::int AS dir_hits,
          AVG(o24.pct_change) FILTER (
            WHERE s.market_condition = 'hostile' AND s.score >= 7 AND o24.pct_change IS NOT NULL
          )::float AS avg_move,
          (SELECT COUNT(*)::int FROM scanner_signals WHERE direction = 'long') AS total_all
        FROM scanner_signals s
        LEFT JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
        WHERE s.direction = 'long'
      `

    const agg = aggRows[0] ?? {}
    const denom = (agg.filtered_with_24h ?? 0) as number
    return {
      tp1WinRate:          denom > 0 ? ((agg.tp1_hits as number) / denom) * 100 : null,
      directionalAccuracy: denom > 0 ? ((agg.dir_hits as number) / denom) * 100 : null,
      totalSignals:        (agg.total_all ?? 0) as number,
      signalsConfirmed:    (agg.tp1_hits ?? 0) as number,
      avgMove:             denom > 0 ? (agg.avg_move as number) : null,
    }
  } catch {
    return EMPTY_STATS
  }
}

export async function getScannerRecentWins(side: ScannerSide, limit = 12): Promise<ScannerRecentWin[]> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const rows = side === "short"
      ? await sql`
        SELECT s.symbol, s.exchange,
               o24.pct_change::float AS pct_change,
               s.scanned_at
        FROM scanner_signals s
        JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
        WHERE s.market_condition = 'favourable'
          AND s.score >= 7
          AND o24.pct_change <= -1.5
          AND s.scanned_at > NOW() - INTERVAL '30 days'
        ORDER BY s.scanned_at DESC
        LIMIT ${limit}
      `
      : await sql`
        SELECT s.symbol, s.exchange,
               o24.pct_change::float AS pct_change,
               s.scanned_at
        FROM scanner_signals s
        JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
        WHERE s.direction = 'long'
          AND o24.pct_change > 0
          AND s.scanned_at > NOW() - INTERVAL '30 days'
        ORDER BY s.scanned_at DESC
        LIMIT ${limit}
      `

    return (rows as Array<{ symbol: string; exchange: string; pct_change: number; scanned_at: string }>).map(r => ({
      side,
      symbol:    r.symbol,
      exchange:  r.exchange,
      pctChange: r.pct_change,
      tp:        side === "short" ? (r.pct_change <= -4 ? 3 : r.pct_change <= -2.5 ? 2 : 1) : undefined,
      scannedAt: r.scanned_at,
    }))
  } catch {
    return []
  }
}
