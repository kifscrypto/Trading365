import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import type { SqlClient } from "@/app/api/scanner/_core"
import {
  computePnl,
  persistPnl,
  PNL_START_BALANCE,
  PNL_POSITION_FRACTION,
  type PnlBook,
} from "@/lib/scanner-pnl"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Strip the heavy per-trade ledger from a book for the JSON response — callers
// only need the headline numbers + the sparkline series.
function slim(book: PnlBook) {
  return {
    startBalance: book.startBalance,
    startDate: book.startDate,
    balance: Math.round(book.balance * 100) / 100,
    returnPct: Math.round(book.returnPct * 10) / 10,
    trades: book.trades,
    wins: book.wins,
    series: book.series.map((v) => Math.round(v * 100) / 100),
  }
}

/**
 * Recalculate the simulated running balance from scratch.
 *
 * GET                    → recompute + return all three books (read-only).
 * GET ?persist=true      → also rewrite the persisted scanner_pnl ledger.
 *                          Authorised cron / admin only (writes the table).
 *
 * The same persist path is invoked automatically by the outcome tracker whenever
 * fresh 24h outcomes are recorded (see app/api/scanner/outcomes/route.ts).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const wantPersist = url.searchParams.get("persist") === "true"

  const sql = neon(process.env.DATABASE_URL!) as SqlClient

  try {
    let result
    if (wantPersist) {
      // Writing the table → require cron secret or an admin session.
      const auth = request.headers.get("authorization")
      const cookies = request.headers.get("cookie") ?? ""
      const hasSession = cookies.split(";").some((c) => c.trim().startsWith("admin_auth="))
      const isCron = url.searchParams.get("cron") === "true"
      if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      result = await persistPnl(sql)
    } else {
      result = await computePnl(sql)
    }

    return NextResponse.json({
      ok: true,
      persisted: wantPersist,
      config: { startBalance: PNL_START_BALANCE, positionFraction: PNL_POSITION_FRACTION },
      combined: slim(result.combined),
      short: slim(result.short),
      long: slim(result.long),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[scanner/pnl]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
