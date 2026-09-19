"use client"

import { useEffect, useState } from 'react'

/**
 * UTC clock and the next scan slot.
 *
 * Client-only by necessity: any timestamp rendered during SSR is already stale
 * by the time the browser hydrates it, which is a guaranteed hydration
 * mismatch. So the server renders a fixed-width placeholder and the real value
 * appears on mount.
 *
 * NEXT SCAN is the real schedule, not decoration. /api/scanner/entries and
 * /api/scanner/long-entries both run every 15 minutes (see vercel.json), so the
 * next quarter-hour boundary is always an actual scan slot.
 */
function nextScanSlot(d: Date): string {
  const m = d.getUTCMinutes()
  const rolled = (Math.floor(m / 15) + 1) * 15
  const minutes = rolled === 60 ? 0 : rolled
  const hours = rolled === 60 ? (d.getUTCHours() + 1) % 24 : d.getUTCHours()
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function UtcClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider t-dim sm:gap-3">
      <span className="tabular-nums">
        {now ? now.toISOString().slice(11, 19) : '--:--:--'} UTC
      </span>
      <span aria-hidden="true" className="h-3 border-l t-line" />
      <span className="tabular-nums">NEXT SCAN {now ? nextScanSlot(now) : '--:--'}</span>
    </div>
  )
}
