import Link from "next/link"
import { TrendingDown, TrendingUp } from "lucide-react"
import type { ScannerRecentWin } from "@/lib/scanner-stats"

// Full-width auto-scrolling strip of recent confirmed scanner wins (short 🔻 +
// long 🔺). Pure CSS marquee — items are rendered twice so the loop is seamless.
// Hovering pauses it; respects prefers-reduced-motion.
export function ScannerTicker({ wins }: { wins: ScannerRecentWin[] }) {
  if (wins.length === 0) return null

  const Item = ({ win, i }: { win: ScannerRecentWin; i: number }) => {
    const isShort = win.side === "short"
    const color = isShort ? "text-primary" : "text-emerald-400"
    const Icon = isShort ? TrendingDown : TrendingUp
    return (
      <span key={`${win.symbol}-${win.scannedAt}-${i}`} className="inline-flex items-center gap-1.5 px-4">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="font-semibold text-foreground">{win.symbol}</span>
        <span className={`tabular-nums font-semibold ${color}`}>
          {win.pctChange > 0 ? "+" : ""}{win.pctChange.toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">{win.exchange}</span>
        <span className="text-muted-foreground/40">·</span>
      </span>
    )
  }

  return (
    <Link
      href="/scanner"
      aria-label="Recent scanner wins — open the scanner"
      className="scanner-marquee group block w-full overflow-hidden border-b border-border bg-card/40 py-2"
    >
      <div className="flex items-center">
        <span className="z-10 flex shrink-0 items-center gap-1.5 bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground" />
          </span>
          Live Wins
        </span>
        <div className="relative flex-1 overflow-hidden text-sm">
          <div className="scanner-marquee-track">
            {/* rendered twice for a seamless -50% loop */}
            {wins.map((w, i) => <Item key={`a-${i}`} win={w} i={i} />)}
            {wins.map((w, i) => <Item key={`b-${i}`} win={w} i={i} />)}
          </div>
        </div>
      </div>
    </Link>
  )
}
