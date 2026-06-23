import { Badge } from "@/components/ui/badge"
import { Sparkline } from "@/components/sparkline"
import { PNL_DISCLAIMER, type PnlBook } from "@/lib/scanner-pnl"

interface ScannerPnlCardProps {
  book: PnlBook
  accent: "red" | "emerald"
  // Optional heading override (e.g. "Combined" / "Shorts" / "Longs").
  heading?: string
}

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })

const fmtPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

export function ScannerPnlCard({ book, accent, heading = "Simulated P&L" }: ScannerPnlCardProps) {
  const up = book.returnPct >= 0
  const accentText = accent === "red" ? "text-red-400" : "text-emerald-400"
  const accentBorder = accent === "red" ? "border-red-500/20" : "border-emerald-500/20"
  const retColor = up ? "text-emerald-400" : "text-red-400"
  const sparkStroke = up ? "#34d399" : "#f87171"

  return (
    <section className="bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <div className={`rounded-xl border ${accentBorder} bg-zinc-900 p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {heading}
              </h2>
              <Badge variant="outline" className={`gap-1.5 ${accentBorder} ${accentText}`}>
                Backtested
              </Badge>
            </div>
            <span className="hidden sm:block text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {book.trades.toLocaleString()} signals followed
            </span>
          </div>

          {book.trades === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Accumulating — no closed signals yet.
            </p>
          ) : (
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="text-4xl font-bold tabular-nums text-foreground">
                  {fmtUsd(book.balance)}
                </p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${retColor}`}>
                  {fmtPct(book.returnPct)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">total return</span>
                </p>
              </div>
              <div className="w-full">
                <Sparkline data={book.series} stroke={sparkStroke} width={320} height={64} className="w-full" />
              </div>
            </div>
          )}

          <p className="mt-5 text-xs font-medium text-muted-foreground">
            Simulated P&amp;L — $1,000 start
            {book.startDate ? ` on ${fmtDate(book.startDate)}` : ""}, 10% position sizing, all signals followed
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">{PNL_DISCLAIMER}</p>
        </div>
      </div>
    </section>
  )
}
