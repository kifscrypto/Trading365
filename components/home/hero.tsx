import Link from 'next/link'
import { ReceiptCard } from './receipt-card'
import { FREE_TIER_DELAY_HOURS, type Receipt } from '@/lib/signals/public'
import { DESK_PRODUCT } from '@/lib/desk'

const PRIMARY_CTA =
  'inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--t-green)] px-6 py-3 text-sm font-semibold text-[#04140B] transition hover:brightness-110'
const SECONDARY_CTA =
  'inline-flex items-center justify-center gap-2 rounded-[10px] border t-line px-6 py-3 text-sm font-semibold text-[var(--t-tx)] transition hover:border-[var(--t-green)] hover:text-[var(--t-green)]'

/**
 * The hero. The claim comes first and the proof sits beside it: the receipt on
 * the right is a real resolved row passed in by the page, not a mock-up.
 *
 * The only h1 on the homepage is here. Every section below uses h2, so the
 * document has exactly one top-level heading and it names the product.
 *
 * The free-tier delay in the microcopy is read from FREE_TIER_DELAY_HOURS, the
 * same constant the scanner's gating uses, so the promise here cannot drift away
 * from the behaviour behind it.
 */
export function Hero({ receipt }: { receipt: Receipt | null }) {
  return (
    <section className="relative mx-auto max-w-7xl px-4 pb-6 pt-12 lg:px-6 lg:pt-16">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] t-green">
            // VERIFIED ALTCOIN SIGNAL ENGINE — EVERY SIGNAL PUBLIC
          </p>

          <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--t-tx)] text-balance sm:text-5xl lg:text-6xl">
            Every signal. Published at fire time.{' '}
            <span className="t-green t365-flicker">Nothing deleted.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed t-dim">
            Two AI scanners fire on altcoin perps. Every signal lands in a public, timestamped
            archive the second it fires — the wins, the losses, and the ones still running.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/scanner" className={PRIMARY_CTA}>
              Open the live scanner →
            </Link>
            <Link href="/signals" className={SECONDARY_CTA}>
              See the verified record
            </Link>
          </div>

          <p className="mt-4 font-mono text-[11px] tracking-wider t-dim">
            Free tier: every signal, {FREE_TIER_DELAY_HOURS} hours later.{' '}
            <Link href="/signup" className="t-green hover:underline">
              Members see them live.
            </Link>
          </p>

          <div className="mt-4 flex flex-col gap-4 rounded-[10px] border border-[var(--t-green)]/30 bg-[var(--t-panel)] p-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2" aria-label="T365 Desk offer">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] t-green">T365 DESK · ONE-TIME PURCHASE</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--t-tx)]">
                Professional crypto tools. One payment. No subscription.
              </h2>
              <p className="mt-1 text-sm t-dim">Every future major version included · 365 days of support</p>
            </div>
            <Link
              href="/desk"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[var(--t-green)] px-6 py-3 text-base font-semibold text-[#04140B] transition hover:brightness-110"
            >
              <span className="font-normal text-[#04140B]/60 line-through">$499</span>
              <span>${DESK_PRODUCT.amount} once →</span>
            </Link>
          </div>
        </div>

        {receipt && (
          <div className="flex justify-center lg:justify-end lg:pr-8">
            <ReceiptCard r={receipt} floating />
          </div>
        )}
      </div>
    </section>
  )
}
