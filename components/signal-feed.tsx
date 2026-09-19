import Link from 'next/link'
import { displayPair, sideLabel, fmtPct, fmtUtc, type Receipt } from '@/lib/signals/public'

/**
 * The uncurated results feed. Shared by the homepage and /scanner.
 *
 * The caller passes rows from getArchivePage — the same rows, the same query,
 * the same ordering the public archive uses — sliced to whatever length it
 * wants. There is no filter on outcome here and there must never be one:
 * "nothing deleted" is the claim the whole site makes, so a stopped-out signal
 * appears in this list exactly like a winner does, in the order it closed.
 *
 * This lives outside components/home/ on purpose. It was built for the homepage,
 * but /scanner now renders the identical feed — a page that showed only TP hits
 * while the homepage showed losses was the single clearest contradiction of the
 * brand claim on the whole site.
 */
function resultText(r: Receipt): string {
  const move = r.move_pct != null ? fmtPct(r.move_pct) : '—'
  if (r.status.startsWith('tp')) return `${r.status.toUpperCase()} ${move}`
  if (r.status === 'sl') return `STOPPED ${move}`
  return 'EXPIRED'
}

export function SignalFeed({ rows }: { rows: Receipt[] }) {
  if (rows.length === 0) {
    return (
      <p className="t-panel rounded-[10px] border t-line p-6 text-center font-mono text-xs t-dim">
        No signals have resolved yet. The archive fills as positions close.
      </p>
    )
  }

  return (
    <ul className="t-panel divide-y divide-[var(--t-line)] overflow-hidden rounded-[10px] border t-line">
      {rows.map((r) => {
        const win = r.status.startsWith('tp')
        const lost = r.status === 'sl'
        const tone = win ? 't-green' : lost ? 't-red' : 't-dim'
        return (
          <li key={r.public_id}>
            <Link
              href={`/signals/${r.public_id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 font-mono text-xs transition-colors hover:bg-[color-mix(in_oklab,var(--t-green)_6%,transparent)]"
            >
              <span className="tabular-nums t-dim">{fmtUtc(r.fired_at)}</span>
              <span className="font-bold text-[var(--t-tx)]">{displayPair(r.symbol)}</span>
              <span className="rounded border px-1.5 py-0.5 text-[10px] tracking-wider t-line t-dim">
                {sideLabel(r.side).toUpperCase()}
              </span>
              <span className={`ml-auto tabular-nums font-bold ${tone}`}>{resultText(r)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
