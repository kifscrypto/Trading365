import { neon } from "@neondatabase/serverless"
import type { SqlClient } from "@/app/api/scanner/_core"

/**
 * Simulated running P&L for the scanner's fired alerts.
 *
 * Dead simple: a trade wins or it loses. A virtual book starts at $1,000 and, for
 * every RESOLVED fired alert (in chronological order), opens a position sized at a
 * FIXED FRACTION (10%) of the *current* running balance:
 *
 *   • WIN  — the alert hit a take-profit (tp_result TP1..TP5). The WHOLE position
 *            exits at that take-profit's move (+1.5 / +2.5 / +4 / +6 / +8%).
 *   • LOSS — the alert stopped out (any non-TP result). The WHOLE position exits at
 *            its stored stop (stop_price), else a 3% house fallback if none stored.
 *
 * That's it — no tranches, no partial scale-outs, no "trail to breakeven". Those
 * shrank every winner to a fraction while losses stayed full-size, which is how a
 * 63% win rate perversely showed as flat. Now a win is a win at the level it hit.
 *
 * Signal sets: shorts = telegram_alerts, longs = telegram_alerts_long, both scored
 * by their monitor's tp_result. The candidate pool (scanner_signals) is NOT used:
 * it kept opening phantom shorts every 30-min scan even in a neutral/rising regime,
 * dragging the board down with trades no member ever received. Because both books
 * read the exact fired-alert set members got, each matches its headline win rate
 * exactly, and neither moves while the scanner is "holding fire" (no new alerts →
 * no new sim trades).
 *
 * Three independent books are computed: `short`, `long`, and `combined` (one
 * $1,000 book that takes both sides interleaved chronologically — the "combined
 * total"). Only the combined ledger is persisted to scanner_pnl; the per-side
 * books are derived in-memory for the separate cards.
 */

export const PNL_START_BALANCE = 1000
export const PNL_POSITION_FRACTION = 0.1 // 10% of running balance per trade

// Favourable move (%) banked when an alert hits each take-profit tier. A winning
// trade exits its FULL position at the move for the highest tier it reached.
const TP_MOVE: Record<string, number> = {
  TP1: 1.5,
  TP2: 2.5,
  TP3: 4.0,
  TP4: 6.0,
  TP5: 8.0,
}

// House stop used to size a loss when an alert has no stored stop_price (e.g.
// pre-stop-tracking alerts). Matches the live page's STOP_LOSS_PCT fallback so the
// two surfaces agree.
const STOP_LOSS_FALLBACK_PCT = 3

export const PNL_LABEL =
  "Simulated P&L — $1,000 start, 10% position sizing, all signals followed"
export const PNL_DISCLAIMER =
  "Simulated performance. Assumes 10% position sizing, no fees, no slippage. Past performance does not guarantee future results."

export type PnlBookKey = "combined" | "short" | "long"
// The trade's outcome: the take-profit tier it hit, or 'SL' if it stopped out.
export type PnlExitReason = "TP1" | "TP2" | "TP3" | "TP4" | "TP5" | "SL"

export interface PnlTrade {
  signalId: number
  direction: "short" | "long"
  entryPrice: number
  exitPrice: number
  exitReason: PnlExitReason
  pnlPct: number // per-trade favourable return %, e.g. +4.0 (TP3) or −3.0 (SL)
  runningBalance: number // book balance AFTER this trade
  closedAt: string // ISO — the alert's triggered_at (chronological key)
}

export interface PnlBook {
  startBalance: number
  startDate: string | null // ISO of the first tracked alert (when the book began)
  balance: number
  returnPct: number
  trades: number
  wins: number
  series: number[] // running balance over time, leading $1,000 baseline included
  rows: PnlTrade[]
}

export interface PnlResult {
  combined: PnlBook
  short: PnlBook
  long: PnlBook
}

function emptyBook(): PnlBook {
  return {
    startBalance: PNL_START_BALANCE,
    startDate: null,
    balance: PNL_START_BALANCE,
    returnPct: 0,
    trades: 0,
    wins: 0,
    series: [PNL_START_BALANCE],
    rows: [],
  }
}

function emptyResult(): PnlResult {
  return { combined: emptyBook(), short: emptyBook(), long: emptyBook() }
}

// A trade whose exit is already resolved (before the compounding walk assigns a
// running balance).
type ResolvedTrade = Omit<PnlTrade, "runningBalance">

interface FiredAlert {
  id: number
  entryPrice: number
  stopPrice: number | null
  tpResult: string
  triggeredAt: string
}

// Fired alert → resolved trade. Win = full position exits at the take-profit it
// hit; loss = full position exits at the stored stop. `pnlPct` is the favourable
// return (positive = win) regardless of side; only the cosmetic exit price differs
// (shorts profit on a price drop, longs on a rise).
function resolveAlert(a: FiredAlert, direction: "short" | "long"): ResolvedTrade {
  const entry = a.entryPrice
  const tpMove = TP_MOVE[a.tpResult]
  let pnlPct: number
  let exitReason: PnlExitReason
  if (tpMove != null) {
    // WIN — whole position banks the take-profit it reached.
    pnlPct = tpMove
    exitReason = a.tpResult as PnlExitReason
  } else {
    // LOSS — whole position exits at the stop (distance from entry, either side).
    const stopDistPct =
      a.stopPrice != null && entry > 0
        ? Math.abs((a.stopPrice - entry) / entry) * 100
        : STOP_LOSS_FALLBACK_PCT
    pnlPct = -(stopDistPct > 0 ? stopDistPct : STOP_LOSS_FALLBACK_PCT)
    exitReason = "SL"
  }
  const exitPrice =
    direction === "long"
      ? entry * (1 + pnlPct / 100)
      : entry * (1 - pnlPct / 100) // short: favourable return is a price drop
  return {
    signalId: a.id,
    direction,
    entryPrice: entry,
    exitPrice,
    exitReason,
    pnlPct,
    closedAt: a.triggeredAt,
  }
}

// Compound a set of resolved trades chronologically through a fresh $1,000
// fixed-fraction book.
function runBook(trades: ResolvedTrade[]): PnlBook {
  const book = emptyBook()
  const sorted = [...trades].sort((a, b) =>
    a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0,
  )
  book.startDate = sorted.length > 0 ? sorted[0].closedAt : null
  for (const t of sorted) {
    const stake = book.balance * PNL_POSITION_FRACTION
    book.balance += stake * (t.pnlPct / 100)
    if (t.pnlPct > 0) book.wins++
    book.trades++
    book.series.push(book.balance)
    book.rows.push({ ...t, runningBalance: book.balance })
  }
  book.returnPct =
    ((book.balance - book.startBalance) / book.startBalance) * 100
  return book
}

// Map raw alert rows (either table — same columns) into resolved trades.
function resolveRows(
  rows: Array<Record<string, unknown>>,
  direction: "short" | "long",
): ResolvedTrade[] {
  return rows
    .map((r) => ({
      id: Number(r.id),
      entryPrice: Number(r.entry),
      stopPrice: r.stop_price != null ? Number(r.stop_price) : null,
      tpResult: String(r.tp_result),
      triggeredAt: new Date(r.triggered_at as string).toISOString(),
    }))
    .filter((a) => Number.isFinite(a.entryPrice) && a.entryPrice > 0)
    .map((a) => resolveAlert(a, direction))
}

/**
 * Recalculate all three books from scratch off the fired-alert history
 * (telegram_alerts for shorts, telegram_alerts_long for longs). Resilient: any DB
 * error yields empty $1,000 books so callers (incl. statically rendered pages at
 * build time) never throw.
 */
export async function computePnl(sql?: SqlClient): Promise<PnlResult> {
  const db = sql ?? (neon(process.env.DATABASE_URL!) as SqlClient)
  try {
    // SHORTS — real fired short alerts, intraday tp_result.
    const shortRows = (await db`
      SELECT id, entry_price::float AS entry, stop_price::float AS stop_price,
             tp_result, triggered_at
      FROM telegram_alerts
      WHERE tp_result IS NOT NULL AND tp_result <> ''
      ORDER BY triggered_at ASC, id ASC
    `) as Array<Record<string, unknown>>

    // LONGS — real fired long alerts, intraday tp_result.
    const longRows = (await db`
      SELECT id, entry_price::float AS entry, stop_price::float AS stop_price,
             tp_result, triggered_at
      FROM telegram_alerts_long
      WHERE tp_result IS NOT NULL AND tp_result <> ''
      ORDER BY triggered_at ASC, id ASC
    `) as Array<Record<string, unknown>>

    const shortResolved = resolveRows(shortRows, "short")
    const longResolved = resolveRows(longRows, "long")

    return {
      combined: runBook([...shortResolved, ...longResolved]),
      short: runBook(shortResolved),
      long: runBook(longResolved),
    }
  } catch (err) {
    console.error("[scanner-pnl] compute failed:", err instanceof Error ? err.message : err)
    return emptyResult()
  }
}

async function ensurePnlTable(sql: SqlClient): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS scanner_pnl (
      id              SERIAL PRIMARY KEY,
      signal_id       INTEGER REFERENCES scanner_signals(id),
      direction       VARCHAR(10) NOT NULL,
      entry_price     NUMERIC NOT NULL,
      exit_price      NUMERIC,
      exit_reason     VARCHAR(20),
      pnl_pct         NUMERIC,
      running_balance NUMERIC,
      closed_at       TIMESTAMP,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `
}

/**
 * Recompute from scratch and rewrite the persisted combined ledger. The whole
 * ledger is replaced in a single parameterised `unnest` insert (one round trip,
 * injection-safe) rather than per-row. Returns the freshly computed result so
 * callers can reuse it without a second compute.
 */
export async function persistPnl(
  sql?: SqlClient,
  precomputed?: PnlResult,
): Promise<PnlResult> {
  const db = sql ?? (neon(process.env.DATABASE_URL!) as SqlClient)
  const result = precomputed ?? (await computePnl(db))
  try {
    await ensurePnlTable(db)
    await db`DELETE FROM scanner_pnl`

    const rows = result.combined.rows
    if (rows.length > 0) {
      await db`
        INSERT INTO scanner_pnl
          (signal_id, direction, entry_price, exit_price, exit_reason, pnl_pct, running_balance, closed_at)
        SELECT * FROM unnest(
          -- signal_id FKs scanner_signals; both books now key off fired-alert ids
          -- (telegram_alerts / _long), so it is left null rather than mis-linked.
          ${rows.map(() => null)}::int[],
          ${rows.map((r) => r.direction)}::text[],
          ${rows.map((r) => r.entryPrice)}::numeric[],
          ${rows.map((r) => r.exitPrice)}::numeric[],
          ${rows.map((r) => r.exitReason)}::text[],
          ${rows.map((r) => r.pnlPct)}::numeric[],
          ${rows.map((r) => r.runningBalance)}::numeric[],
          ${rows.map((r) => r.closedAt)}::timestamptz[]
        )
      `
    }
  } catch (err) {
    console.error("[scanner-pnl] persist failed:", err instanceof Error ? err.message : err)
  }
  return result
}
