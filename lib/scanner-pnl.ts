import { neon } from "@neondatabase/serverless"
import type { SqlClient } from "@/app/api/scanner/_core"

/**
 * Simulated running P&L for the scanner signals.
 *
 * A virtual book starts at $1,000 and, for every signal that reaches a matured
 * 24h outcome (in chronological order), opens a position sized at a FIXED
 * FRACTION (10%) of the *current* running balance, then SCALES OUT:
 *
 *   • 50% of the position exits at TP1 (+1.5% fav) if TP1 is reached
 *   • 25% exits at TP2 (+2.5% fav) if reached
 *   • 25% exits at TP3 (+4.0% fav) if reached
 *   • any tranche whose TP was NOT reached exits at the 24h price
 *   • if the trade was stopped out, the ENTIRE position exits at the stop loss
 *
 * The per-trade return is the weighted blend of the tranche exits. A TP is
 * "reached" when the 24h favourable move hits that level — the same convention
 * the stats, closed-results and live record use (intra-window touches that
 * reverse before the 24h mark are not captured; the data stores only the 24h
 * snapshot + whether the stop was breached).
 *
 * CRITICAL (spec §6): losses respect the stop loss. The outcome tracker already
 * caps `scanner_outcomes.pct_change` at the stop level and flags `stopped_out`
 * (see app/api/scanner/outcomes/route.ts) — so we read that capped value
 * directly and NEVER the raw 24h move. A stopped-out trade's loss is the stop %.
 *
 * The eligible signal set mirrors the live track record + scanner-stats exactly
 * (short = favourable regime, score ≥ 7; long = hostile regime, score ≥ 7, post
 * 2026-06-18 rewrite) so the simulated P&L can never contradict the headline
 * win rates shown beside it.
 *
 * Three independent books are computed: `short`, `long`, and `combined` (one
 * $1,000 book that takes both sides interleaved chronologically — the "combined
 * total"). Only the combined ledger is persisted to scanner_pnl; the per-side
 * books are derived in-memory for the separate cards.
 */

export const PNL_START_BALANCE = 1000
export const PNL_POSITION_FRACTION = 0.1 // 10% of running balance per trade

// Tiered scale-out: tranche weights (must sum to 1) and the favourable move at
// which each take-profit fills.
const TP1_WEIGHT = 0.5
const TP2_WEIGHT = 0.25
const TP3_WEIGHT = 0.25
const TP1_MOVE = 1.5
const TP2_MOVE = 2.5
const TP3_MOVE = 4.0

export const PNL_LABEL =
  "Simulated P&L — $1,000 start, 10% position sizing, all signals followed"
export const PNL_DISCLAIMER =
  "Simulated performance. Assumes 10% position sizing, no fees, no slippage. Past performance does not guarantee future results."

export type PnlBookKey = "combined" | "short" | "long"
// Highest take-profit tier the trade reached (or 'SL'/'24H'). The actual exit is
// a weighted blend of tranches; this label records the best level hit.
export type PnlExitReason = "TP1" | "TP2" | "TP3" | "SL" | "24H"

export interface PnlTrade {
  signalId: number
  direction: "short" | "long"
  entryPrice: number
  exitPrice: number
  exitReason: PnlExitReason
  pnlPct: number // per-trade favourable return %, e.g. +1.5 (TP1) or −3.0 (SL)
  runningBalance: number // book balance AFTER this trade
  closedAt: string // ISO — the signal's scanned_at (chronological key)
}

export interface PnlBook {
  startBalance: number
  startDate: string | null // ISO of the first tracked signal (when the book began)
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

interface EligibleSignal {
  id: number
  direction: "short" | "long"
  entryPrice: number
  outcomePrice: number
  pctChange: number // stop-aware capped 24h price move (signed)
  stoppedOut: boolean
  scannedAt: string
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

// Resolve one signal's scaled exit (blended price, best-tier label, per-trade
// favourable return %). `favMove` is the favourable move: shorts profit when
// price falls, longs when it rises, so it is the price move flipped for shorts.
function resolveTrade(s: EligibleSignal): {
  exitPrice: number
  exitReason: PnlExitReason
  pnlPct: number
} {
  const isLong = s.direction === "long"
  const favMove = isLong ? s.pctChange : -s.pctChange

  let pnlPct: number
  let exitReason: PnlExitReason

  if (s.stoppedOut) {
    // Stop breached in the window → the entire position exits at the stop. The
    // favourable move is the (negative) capped stop loss, never the raw move.
    pnlPct = favMove
    exitReason = "SL"
  } else {
    // Scale out: each tranche takes its TP if the 24h move reached it, otherwise
    // exits at the 24h price (the stop was never hit, so it's always the 24h px).
    const t1 = favMove >= TP1_MOVE ? TP1_MOVE : favMove
    const t2 = favMove >= TP2_MOVE ? TP2_MOVE : favMove
    const t3 = favMove >= TP3_MOVE ? TP3_MOVE : favMove
    pnlPct = TP1_WEIGHT * t1 + TP2_WEIGHT * t2 + TP3_WEIGHT * t3
    exitReason =
      favMove >= TP3_MOVE ? "TP3" :
      favMove >= TP2_MOVE ? "TP2" :
      favMove >= TP1_MOVE ? "TP1" : "24H"
  }

  // Blended exit price implied by the weighted return (favourable move flipped
  // back to a raw price move for the direction).
  const exitPrice = s.entryPrice * (1 + (isLong ? pnlPct : -pnlPct) / 100)
  return { exitPrice, exitReason, pnlPct }
}

// Run a chronological list of signals through a fresh $1,000 fixed-fraction book.
function runBook(signals: EligibleSignal[]): PnlBook {
  const book = emptyBook()
  book.startDate = signals.length > 0 ? signals[0].scannedAt : null
  for (const s of signals) {
    const { exitPrice, exitReason, pnlPct } = resolveTrade(s)
    const stake = book.balance * PNL_POSITION_FRACTION
    const profit = stake * (pnlPct / 100)
    book.balance += profit
    if (pnlPct > 0) book.wins++
    book.trades++
    book.series.push(book.balance)
    book.rows.push({
      signalId: s.id,
      direction: s.direction,
      entryPrice: s.entryPrice,
      exitPrice,
      exitReason,
      pnlPct,
      runningBalance: book.balance,
      closedAt: s.scannedAt,
    })
  }
  book.returnPct =
    ((book.balance - book.startBalance) / book.startBalance) * 100
  return book
}

/**
 * Recalculate all three books from scratch off the signal + outcome history.
 * Resilient: any DB error yields empty $1,000 books so callers (incl. statically
 * rendered pages at build time) never throw.
 */
export async function computePnl(sql?: SqlClient): Promise<PnlResult> {
  const db = sql ?? (neon(process.env.DATABASE_URL!) as SqlClient)
  try {
    const rows = (await db`
      SELECT
        s.id,
        s.direction,
        s.price_at_signal::float AS entry,
        o.price::float           AS outcome_price,
        o.pct_change::float      AS pct,
        COALESCE(o.stopped_out, FALSE) AS stopped_out,
        s.scanned_at
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.score >= 7
        AND (
          (s.direction = 'short' AND s.market_condition = 'favourable')
          OR
          (s.direction = 'long'  AND s.market_condition = 'hostile' AND s.scanned_at > '2026-06-18')
        )
      ORDER BY s.scanned_at ASC, s.id ASC
    `) as Array<Record<string, unknown>>

    const eligible: EligibleSignal[] = rows
      .map((r) => ({
        id: Number(r.id),
        direction: (r.direction as string) === "long" ? "long" : "short",
        entryPrice: Number(r.entry),
        outcomePrice: Number(r.outcome_price),
        pctChange: Number(r.pct),
        stoppedOut: Boolean(r.stopped_out),
        scannedAt: new Date(r.scanned_at as string).toISOString(),
      }))
      .filter(
        (s) =>
          Number.isFinite(s.entryPrice) &&
          Number.isFinite(s.pctChange) &&
          s.entryPrice > 0,
      ) as EligibleSignal[]

    return {
      combined: runBook(eligible),
      short: runBook(eligible.filter((s) => s.direction === "short")),
      long: runBook(eligible.filter((s) => s.direction === "long")),
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
          ${rows.map((r) => r.signalId)}::int[],
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
