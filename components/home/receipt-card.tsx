import Link from 'next/link'
import {
  displayPair, sideLabel, STATUS_LABEL, fmtPrice, fmtPct, fmtUtc, type Receipt,
} from '@/lib/signals/public'

/**
 * A real, resolved public receipt.
 *
 * Deliberately rendered with the same fields and the same formatting helpers the
 * public archive uses (lib/signals/public), so the card shown on the homepage
 * and the row shown on /signals can never disagree about what a signal said or
 * how it ended. Nothing here is illustrative — the caller passes an actual row.
 *
 * Colour discipline: green marks a target hit, red marks a stop-out, and
 * nothing else uses red. The direction chip is neutral because a short is not a
 * loss, and colouring it red would say that it is.
 */
export function ReceiptCard({
  r,
  floating = false,
}: {
  r: Receipt
  floating?: boolean
}) {
  const win = r.status.startsWith('tp')
  const lost = r.status === 'sl'
  const tone = win ? 't-green' : lost ? 't-red' : 't-dim'

  return (
    <div
      className={`t-panel relative w-full max-w-md rounded-[10px] border t-line p-5 shadow-2xl ${
        floating ? 't365-float' : ''
      }`}
    >
      <span className="t-chip absolute -right-3 -top-3 rotate-[8deg] rounded border-2 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em]">
        VERIFIED
      </span>

      <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-wider t-dim">
        <span>PUBLIC RECEIPT</span>
        <span className="tabular-nums">{fmtUtc(r.fired_at)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link
          href={`/signals/${r.public_id}`}
          className="text-xl font-bold tracking-tight text-[var(--t-tx)] hover:text-[var(--t-green)]"
        >
          {displayPair(r.symbol)}
        </Link>
        <span className="rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider t-line t-dim">
          {sideLabel(r.side).toUpperCase()}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-xs">
        <div>
          <dt className="text-[10px] tracking-wider t-dim">ENTRY</dt>
          <dd className="tabular-nums">${fmtPrice(r.entry_price)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wider t-dim">EXCHANGE</dt>
          <dd>{r.exchange.toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wider t-dim">RESULT</dt>
          <dd className={tone}>{STATUS_LABEL[r.status]}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wider t-dim">MOVE</dt>
          <dd className={`tabular-nums ${tone}`}>
            {r.move_pct != null ? fmtPct(r.move_pct) : '—'}
          </dd>
        </div>
      </dl>

      <Link
        href={`/signals/${r.public_id}`}
        className="mt-4 block truncate font-mono text-[10px] tracking-wider t-dim hover:text-[var(--t-green)]"
      >
        /signals/{r.public_id} →
      </Link>
    </div>
  )
}
