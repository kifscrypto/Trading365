import { Badge } from '@/components/ui/badge'
import {
  displayPair, sideLabel, tiersFor, fmtPrice, fmtUtc,
  type OpenReceipt,
} from '@/lib/signals/public'

// Shared open-signal card, used by both /dashboard (the full live book) and
// /account (the member home, which surfaces the freshest few). It lives in
// components/ rather than inside the dashboard page so the two surfaces cannot
// drift apart.

function ageLabel(hours: number): string {
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`
}

export function OpenSignalCard({ r, live }: { r: OpenReceipt; live: boolean }) {
  const isShort = r.side === 'short'
  const tiers = tiersFor(r)
  const justFired = r.age_hours < 0.25

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={
            isShort
              ? 'gap-1 border-rose-500/30 bg-rose-500/10 text-rose-400'
              : 'gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }
        >
          {sideLabel(r.side).toUpperCase()}
        </Badge>
        <span className="text-lg font-bold tracking-tight">{displayPair(r.symbol)}</span>
        <Badge variant="outline" className="text-muted-foreground">{r.exchange.toUpperCase()}</Badge>
        <Badge variant="outline" className="text-muted-foreground">{r.timeframe}</Badge>
        {live && justFired && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> just fired
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Entry </span>
          <span className="font-semibold tabular-nums">${fmtPrice(r.entry_price)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Stop </span>
          <span className="font-semibold tabular-nums text-rose-400">
            {r.stop_price ? `$${fmtPrice(r.stop_price)}` : '—'}
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {tiers.map((t) => (
          <span key={t.label} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">{t.label} </span>
            <span className="tabular-nums">${fmtPrice(t.price)}</span>
            <span className="text-muted-foreground"> ({t.pct > 0 ? '+' : ''}{t.pct}%)</span>
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Fired {fmtUtc(r.fired_at)} · {ageLabel(r.age_hours)} ago
      </p>
    </div>
  )
}
