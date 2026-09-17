import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { jsonLd } from '@/lib/utils/json-ld'
import { generateBreadcrumbSchema } from '@/lib/schema'
import { ShareButton } from '@/components/share-button'
import {
  getReceipt, isIndexable, displayPair, sideLabel, tiersFor, signalLabels,
  STATUS_LABEL, fmtPrice, fmtPct, fmtUtc, hoursHeld, resultPhrase,
  receiptTitle, receiptDescription, receiptUrl,
  type Receipt,
} from '@/lib/signals/public'

// Receipts only change when a signal resolves, and the monitor calls
// revalidatePath on close, so a 5-minute window is plenty (matches /scanner).
export const revalidate = 300

interface Params {
  params: Promise<{ public_id: string }>
}

/** A receipt is public only once it has resolved — see the page component. */
async function loadReceipt(publicId: string): Promise<Receipt | null> {
  const r = await getReceipt(publicId)
  if (!r || r.status === 'fired') return null
  return r
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { public_id } = await params
  const r = await loadReceipt(public_id)
  if (!r) {
    // An unresolved signal has no public page at all, so this is a genuine 404
    // rather than an indexable placeholder.
    return { title: 'Signal not found', robots: { index: false, follow: false } }
  }
  const title = receiptTitle(r)
  const description = receiptDescription(r)
  const url = receiptUrl(r.public_id)
  // Historical (reconstructed) receipts stay crawlable but out of the index
  // until SIGNALS_BACKFILL_INDEXABLE is flipped — see lib/signals/public.ts.
  const indexable = isIndexable(r)
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: 'article', title, description, url, siteName: 'Trading365' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'muted' }) {
  const colour =
    tone === 'up' ? 'text-emerald-400'
      : tone === 'down' ? 'text-rose-400'
        : tone === 'muted' ? 'text-muted-foreground'
          : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${colour}`}>{value}</p>
    </div>
  )
}

export default async function SignalReceiptPage({ params }: Params) {
  const { public_id } = await params
  const r = await loadReceipt(public_id)
  // Unresolved ('fired') signals are deliberately not public: the paid tier sees
  // them live, the world sees the finished record. Nothing links to them and
  // they are never listed, so a 404 here costs no crawl budget.
  if (!r) notFound()

  const pair = displayPair(r.symbol)
  const isShort = r.side === 'short'
  const tiers = tiersFor(r)
  const won = r.status.startsWith('tp')
  const reachedLevel = won ? Number(r.status.slice(2)) : 0
  const held = hoursHeld(r)
  const peak = r.mfe_pct != null ? Number(r.mfe_pct) : null
  const reasons = signalLabels(r.signals)
  const stopPct = r.stop_price
    ? ((Number(r.stop_price) - Number(r.entry_price)) / Number(r.entry_price)) * 100
    : null

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(generateBreadcrumbSchema([
            { name: 'Verified results', url: '/signals' },
            { name: `${pair} ${sideLabel(r.side)} — ${fmtUtc(r.fired_at, false)}` },
          ])),
        }}
      />

      <Breadcrumbs items={[{ label: 'Verified results', href: '/signals' }, { label: `${pair} ${sideLabel(r.side)}` }]} />
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge
          className={
            isShort
              ? 'gap-1 border-rose-500/30 bg-rose-500/10 text-rose-400'
              : 'gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }
        >
          {isShort ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
          {isShort ? 'SHORT' : 'LONG'}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {pair} <span className="text-muted-foreground">/ USDT</span>
        </h1>
        <Badge variant="outline" className="text-muted-foreground">{r.exchange.toUpperCase()}</Badge>
        <Badge variant="outline" className="text-muted-foreground">{r.timeframe} setup · 1H entry</Badge>
      </div>

      {/* ── Outcome ────────────────────────────────────────────────────────── */}
      <div
        className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
          won ? 'border-emerald-500/30 bg-emerald-500/5'
            : r.status === 'sl' ? 'border-rose-500/30 bg-rose-500/5'
              : 'border-border bg-muted/30'
        }`}
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Outcome</p>
          <p className={`text-lg font-semibold ${won ? 'text-emerald-400' : r.status === 'sl' ? 'text-rose-400' : 'text-foreground'}`}>
            {resultPhrase(r)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Signal ID</p>
            <p className="font-mono text-sm text-muted-foreground">{r.public_id}</p>
          </div>
          {/* Above the fold, next to the result: the moment someone wants to share. */}
          <ShareButton
            url={receiptUrl(r.public_id)}
            title={receiptTitle(r)}
            variant="button"
            label="Share this signal"
          />
        </div>
      </div>

      {/* ── Key numbers ────────────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Entry" value={`$${fmtPrice(r.entry_price)}`} />
        <Stat label="Stop" value={r.stop_price ? `$${fmtPrice(r.stop_price)}` : '—'} tone="down" />
        <Stat
          label={r.status === 'expired' ? 'Move' : 'Result'}
          value={r.move_pct != null ? fmtPct(r.move_pct) : '—'}
          tone={won ? 'up' : r.status === 'sl' ? 'down' : 'muted'}
        />
        <Stat label="Fired (UTC)" value={fmtUtc(r.fired_at)} />
        <Stat label="Closed (UTC)" value={fmtUtc(r.closed_at)} tone="muted" />
        <Stat label="Time tracked" value={held != null ? `${held}h` : '—'} tone="muted" />
      </div>

      {peak != null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Peak favourable move while tracked:{' '}
          <span className="font-semibold text-foreground">{fmtPct(peak)}</span>
        </p>
      )}
      {/* ── Target ladder ──────────────────────────────────────────────────── */}
      <h2 className="mt-9 text-lg font-semibold">Targets and stop</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Levels are fixed from the entry price at fire time, so they can never be re-drawn after the fact.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Level</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">Move</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-4 py-2 font-medium">Entry</td>
              <td className="px-4 py-2 tabular-nums">${fmtPrice(r.entry_price)}</td>
              <td className="px-4 py-2 text-muted-foreground">—</td>
              <td className="px-4 py-2 text-muted-foreground">Filled at fire</td>
            </tr>
            {tiers.map((t) => {
              const hit = reachedLevel >= t.level
              return (
                <tr key={t.label} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{t.label}</td>
                  <td className="px-4 py-2 tabular-nums">${fmtPrice(t.price)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtPct(t.pct)}</td>
                  <td className={`px-4 py-2 ${hit ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                    {hit ? 'Reached' : won ? 'Not reached' : '—'}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-border">
              <td className="px-4 py-2 font-medium">Stop</td>
              <td className="px-4 py-2 tabular-nums">{r.stop_price ? `$${fmtPrice(r.stop_price)}` : '—'}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">
                {stopPct != null ? fmtPct(stopPct) : '—'}
              </td>
              <td className={`px-4 py-2 ${r.status === 'sl' ? 'text-rose-400' : 'text-muted-foreground'}`}>
                {r.status === 'sl' ? 'Stopped out' : won ? 'Not hit' : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* ── Why it fired ───────────────────────────────────────────────────── */}
      <h2 className="mt-9 text-lg font-semibold">Why the scanner fired it</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {reasons.map((label) => (
          <span key={label} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            {label}
          </span>
        ))}
      </div>
      {r.score != null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Setup score <span className="font-semibold text-foreground">{r.score}</span>
          {r.raw_score != null && r.raw_score !== r.score ? <> (raw {r.raw_score})</> : null}
          {' '}· resolved as <span className="font-semibold text-foreground">{STATUS_LABEL[r.status]}</span>
        </p>
      )}

      {/* ── Verification ───────────────────────────────────────────────────── */}
      <div className="mt-9 flex gap-3 rounded-xl border border-border bg-card p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          {r.origin === 'live' ? (
            <p className="text-foreground">
              <span className="font-semibold">Verified by Trading365.</span> This signal was published at the moment it
              fired — before the outcome was known — and its entry, targets and timestamp have not been edited since.
              Only the result is filled in as the trade resolves.
            </p>
          ) : (
            <p className="text-foreground">
              <span className="font-semibold">Archive entry.</span> This signal predates the public archive, so this page
              was generated later — reconstructed from the timestamps our scanner recorded at fire time. Its entry,
              targets and timestamps are original and unedited; only the result has been added. Signals fired from
              go-live onward are published live, before the outcome is known.
            </p>
          )}
          <p className="mt-2 text-muted-foreground">
            Entry and target levels are computed from the fire-time price, so they cannot be re-drawn retroactively.
            Nothing on this page is ever deleted or rewritten.
          </p>
        </div>
      </div>

      {/* ── CTAs ───────────────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/scanner">
            See live signals <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/signals">Verified results</Link>
        </Button>
        {/* Pasting this URL anywhere renders the per-signal OG card. */}
        <ShareButton url={receiptUrl(r.public_id)} title={receiptTitle(r)} />
      </div>

      {/* ── Methodology ────────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-lg font-semibold">How this result is measured</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>
          <span className="text-foreground">Result</span> is the deepest target price actually touched before the stop,
          measured on 1-hour candles from the exchange named above.
        </li>
        <li>
          <span className="text-foreground">Move</span> is the percentage gained or lost by closing at that level — for
          a short, a fall in price is a gain.
        </li>
        <li>
          <span className="text-foreground">Stopped out</span> means the stop was touched before any target.
        </li>
        <li>
          <span className="text-foreground">Expired</span> means neither a target nor the stop was touched inside the
          48-hour window the scanner watches. It is not a claim that nothing happened afterwards.
        </li>
        <li>
          Results are per signal, not per portfolio: trading both books together would not produce these numbers, and no
          fees, funding or slippage are deducted.
        </li>
      </ul>

      <p className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Not financial advice. Trading365 publishes automated technical analysis for research and education. Signals are
        not recommendations to buy or sell, no return is promised or implied, and leveraged crypto trading can lose more
        than you deposit. See our{' '}
        <Link href="/disclaimer" className="underline hover:text-foreground">full disclaimer</Link>.
      </p>
    </div>
  )
}
