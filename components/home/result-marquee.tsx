import { displayPair, fmtPct, type Receipt } from '@/lib/signals/public'

/**
 * Thin results marquee across the foot of the page.
 *
 * The list is rendered twice and the track slides exactly -50%, which is what
 * makes the loop seamless. CSS only: no JS, no scroll listener, nothing to
 * hydrate. The animation is switched off outright under prefers-reduced-motion
 * (see the .t365 block in globals.css), where the duplicate copy is simply
 * clipped by the overflow container.
 *
 * Marked aria-hidden because it is decoration: every row it shows is also in
 * the live feed above, in full and in order.
 */
function text(r: Receipt): string {
  const move = r.move_pct != null ? fmtPct(r.move_pct) : '—'
  if (r.status.startsWith('tp')) return `${r.status.toUpperCase()} ${move}`
  if (r.status === 'sl') return `STOPPED ${move}`
  return 'EXPIRED'
}

export function ResultMarquee({ rows }: { rows: Receipt[] }) {
  if (rows.length === 0) return null
  const doubled = [...rows, ...rows]

  return (
    <div className="relative overflow-hidden border-y t-line py-2.5" aria-hidden="true">
      <div className="t365-marquee-track flex w-max items-center gap-7 whitespace-nowrap">
        {doubled.map((r, i) => {
          const win = r.status.startsWith('tp')
          const lost = r.status === 'sl'
          return (
            <span key={`${r.public_id}-${i}`} className="flex items-center gap-2 font-mono text-[11px]">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  win ? 'bg-[var(--t-green)]' : lost ? 'bg-[var(--t-red)]' : 'bg-[var(--t-dim)]'
                }`}
              />
              <span className="text-[var(--t-tx)]">{displayPair(r.symbol)}</span>
              <span className="t-dim">{r.side === 'short' ? 'SHORT' : 'LONG'}</span>
              <span className={win ? 't-green' : lost ? 't-red' : 't-dim'}>{text(r)}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
