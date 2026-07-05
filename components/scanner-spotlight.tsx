import Link from "next/link"
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react"
import type { ScannerStats } from "@/lib/scanner-stats"

function fmtPct(n: number | null, digits = 0): string {
  if (n === null) return "—"
  return `${n.toFixed(digits)}%`
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`
}

interface SideProps {
  stats: ScannerStats
  totalAllSignals: number
}

function ShortSide({ stats, totalAllSignals }: SideProps) {
  return (
    <div className="flex flex-col gap-4 p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <TrendingDown className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold uppercase tracking-wide text-primary">Short Scanner</span>
      </div>
      <div>
        <p className="text-4xl font-bold tabular-nums text-primary lg:text-5xl">{fmtPct(stats.tp1WinRate)}</p>
        <p className="mt-1 text-xs text-muted-foreground">TP1 hit rate · downtrend regime</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-semibold tabular-nums text-foreground">{fmtPct(stats.directionalAccuracy)}</p>
          <p className="text-xs text-muted-foreground">Directional accuracy</p>
        </div>
        <div>
          <p className="font-semibold tabular-nums text-foreground">{fmtCount(totalAllSignals)}+</p>
          <p className="text-xs text-muted-foreground">Signals tracked</p>
        </div>
      </div>
      <Link
        href="/scanner"
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Open Short Scanner
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function LongSide({ stats, totalAllSignals }: SideProps) {
  return (
    <div className="flex flex-col gap-4 p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <TrendingUp className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Long Scanner</span>
      </div>
      <div>
        <p className="text-4xl font-bold tabular-nums text-emerald-400 lg:text-5xl">{fmtPct(stats.tp1WinRate)}</p>
        <p className="mt-1 text-xs text-muted-foreground">TP1 hit rate · uptrend regime</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-semibold tabular-nums text-foreground">{fmtPct(stats.directionalAccuracy)}</p>
          <p className="text-xs text-muted-foreground">Directional accuracy</p>
        </div>
        <div>
          <p className="font-semibold tabular-nums text-foreground">{fmtCount(totalAllSignals)}+</p>
          <p className="text-xs text-muted-foreground">Long signals tracked</p>
        </div>
      </div>
      <Link
        href="/scanner/longs"
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
      >
        Open Long Scanner
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

export function ScannerSpotlight({ short, long }: { short: ScannerStats; long: ScannerStats }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 lg:px-6">
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Live AI Altcoin Scanners
        </span>
        <h2 className="mt-3 text-2xl font-bold text-foreground text-balance md:text-3xl">
          Real signals. Tracked outcomes. No hindsight.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every signal&apos;s 24h result is recorded — these are the live hit rates, not cherry-picked screenshots.
        </p>
      </div>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur md:grid-cols-2 md:divide-x md:divide-border">
        <ShortSide stats={short} totalAllSignals={short.totalSignals} />
        <LongSide stats={long} totalAllSignals={long.totalSignals} />
      </div>
    </section>
  )
}
