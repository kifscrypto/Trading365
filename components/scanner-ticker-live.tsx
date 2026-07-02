"use client"

import { useEffect, useState } from "react"
import { ScannerTicker } from "@/components/scanner-ticker"
import type { ScannerRecentWin } from "@/lib/scanner-stats"

// Client-only wrapper: fetches the recent wins after mount so the ticker text
// (e.g. "WLDUSDT") never appears in the initial HTML response. Renders nothing
// until data arrives — identical visual behaviour once hydrated.
export function ScannerTickerLive() {
  const [wins, setWins] = useState<ScannerRecentWin[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/scanner/wins")
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.wins)) setWins(d.wins)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!wins || wins.length === 0) return null
  return <ScannerTicker wins={wins} />
}
