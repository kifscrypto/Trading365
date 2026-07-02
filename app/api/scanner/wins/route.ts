import { NextResponse } from "next/server"
import { getScannerRecentWins } from "@/lib/scanner-stats"

// Recent scanner wins for the homepage "Live Wins" ticker. Served via this API
// so the ticker can be fetched client-side and the symbols never appear in the
// initial server-rendered HTML.
export const dynamic = "force-dynamic"

export async function GET() {
  const [shortWins, longWins] = await Promise.all([
    getScannerRecentWins("short", 10),
    getScannerRecentWins("long", 10),
  ])
  const wins = [...shortWins, ...longWins]
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    .slice(0, 16)
  return NextResponse.json(
    { wins },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  )
}
