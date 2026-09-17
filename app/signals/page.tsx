import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  SITE, getArchiveStats, getArchivePage, parseArchiveFilters, filtersActive,
  getOpenSignals, FREE_TIER_DELAY_HOURS,
  displayPair, sideLabel, STATUS_LABEL, fmtPrice, fmtPct, fmtUtc,
  type ArchiveFilters, type Receipt, type SearchParams,
} from '@/lib/signals/public'

// Matches /scanner — the numbers this page shows must not lag the scanner's.
export const revalidate = 300

const TITLE = 'Verified Results — Every Signal Trading365 Has Fired'
const DESCRIPTION =
  'Every crypto signal Trading365 has fired, with entry, targets, stop and the verified result. A full track record you can filter by pair, direction or date.'

interface PageProps {
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const filters = parseArchiveFilters(await searchParams)
  const filtered = filtersActive(filters)
  const canonical = filtered ? `${SITE}/signals?${toQuery(filters)}` : `${SITE}/signals`
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    // Only the clean hub is indexable. Filter and pagination combinations are
    // an unbounded URL space, so they stay crawlable but out of the index —
    // that single decision is what stops the archive becoming a crawl trap.
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: canonical, siteName: 'Trading365' },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  }
}

/** Serialise filters back into a query string for the filter form + pager. */
function toQuery(f: ArchiveFilters, overrides: Partial<ArchiveFilters> = {}): string {
  const m = { ...f, ...overrides }
  const p = new URLSearchParams()
  if (m.side) p.set('side', m.side)
  if (m.result) p.set('result', m.result)
  if (m.pair) p.set('pair', m.pair)
  if (m.from) p.set('from', m.from)
  if (m.to) p.set('to', m.to)
  if (m.page > 1) p.set('page', String(m.page))
  return p.toString()
}

function ResultBadge({ r }: { r: Receipt }) {
  const cls = r.status.startsWith('tp')
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    : r.status === 'sl'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
      : 'border-border bg-muted/40 text-muted-foreground'
  return <Badge className={cls}>{STATUS_LABEL[r.status]}</Badge>
}

function BigStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  const colour = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${colour}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

const selectCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

export default async function SignalsArchivePage({ searchParams }: PageProps) {
  const filters = parseArchiveFilters(await searchParams)
  const [page, stats, open] = await Promise.all([
    getArchivePage(filters),
    getArchiveStats(30),
    // Anonymous view of the live book: rows plus how many are running that a
    // free reader cannot see yet. Used only for the membership prompt below.
    getOpenSignals({ includeAll: false }),
  ])
  const filtered = filtersActive(filters)

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs items={[{ label: 'Verified results' }]} />

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Verified results</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Every signal the Trading365 scanner has fired, newest first — with the entry, targets and stop it published at
        fire time, and the result it recorded afterwards. Nothing is hidden and nothing is deleted: stopped-out and
        unresolved signals stay in the list alongside the winners.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        This is a record of what was sent, not a selection of what worked.
      </p>

      {/* ── 30-day record ──────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Results — last {stats.days} days</h2>
          <p className="text-xs text-muted-foreground">
            {page.total.toLocaleString('en-US')} signals published in total
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BigStat
            label="Hit rate"
            value={stats.hitRate != null ? `${stats.hitRate.toFixed(1)}%` : '—'}
            sub={`${stats.wins} of ${stats.resolved} resolved`}
            tone="up"
          />
          <BigStat
            label="Avg move / winner"
            value={stats.avgMove != null ? `+${stats.avgMove.toFixed(1)}%` : '—'}
            sub="banked at the target reached"
          />
          <BigStat
            label="Signals fired"
            value={stats.total.toLocaleString('en-US')}
            sub={`in the last ${stats.days} days`}
          />
          <BigStat
            label="Unresolved"
            value={stats.expired.toLocaleString('en-US')}
            sub="no target or stop hit in 48h"
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Book</th>
                <th className="px-4 py-2 font-medium">Resolved</th>
                <th className="px-4 py-2 font-medium">Hit rate</th>
                <th className="px-4 py-2 font-medium">Avg move / winner</th>
              </tr>
            </thead>
            <tbody>
              {([['Short', stats.short], ['Long', stats.long]] as const).map(([label, s]) => (
                <tr key={label} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{label}</td>
                  <td className="px-4 py-2 tabular-nums">{s ? s.resolved : '—'}</td>
                  <td className="px-4 py-2 tabular-nums text-emerald-400">
                    {s?.hitRate != null ? `${s.hitRate.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{s?.avgMove != null ? `+${s.avgMove.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Hit rate counts only signals that reached a target or the stop — signals that did neither inside the 48-hour
          watch window are excluded rather than counted as losses. Avg move is the percentage banked by closing at the
          target reached, averaged over winners. Per-signal results, not a portfolio; fees and funding excluded.
        </p>
      </section>
      {/* ── Filters (a plain GET form — no client JS, fully crawlable) ─────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">All published signals</h2>
        <form method="get" action="/signals" className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="pair" className="text-[11px] uppercase tracking-wider text-muted-foreground">Pair</label>
            <input id="pair" name="pair" defaultValue={filters.pair ?? ''} placeholder="e.g. BTC" className={selectCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="side" className="text-[11px] uppercase tracking-wider text-muted-foreground">Direction</label>
            <select id="side" name="side" defaultValue={filters.side ?? ''} className={selectCls}>
              <option value="">All</option>
              <option value="short">Short</option>
              <option value="long">Long</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="result" className="text-[11px] uppercase tracking-wider text-muted-foreground">Result</label>
            <select id="result" name="result" defaultValue={filters.result ?? ''} className={selectCls}>
              <option value="">All</option>
              <option value="tp">Target hit (any)</option>
              <option value="tp1">TP1</option>
              <option value="tp2">TP2</option>
              <option value="tp3">TP3</option>
              <option value="tp4">TP4</option>
              <option value="tp5">TP5</option>
              <option value="sl">Stopped out</option>
              <option value="expired">Unresolved</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-[11px] uppercase tracking-wider text-muted-foreground">From</label>
            <input id="from" name="from" type="date" defaultValue={filters.from ?? ''} className={selectCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-[11px] uppercase tracking-wider text-muted-foreground">To</label>
            <input id="to" name="to" type="date" defaultValue={filters.to ?? ''} className={selectCls} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit">Apply filters</Button>
            {filtersActive(filters) && (
              <Button asChild variant="outline"><Link href="/signals">Clear</Link></Button>
            )}
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Showing {page.rows.length.toLocaleString('en-US')} of {page.total.toLocaleString('en-US')} matching signals
          {filtered ? ' — filtered view, not indexed by search engines' : ''}.
        </p>

        {page.rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No signals match those filters.</p>
            <Button asChild variant="outline" className="mt-3"><Link href="/signals">Clear filters</Link></Button>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Fired (UTC)</th>
                  <th className="px-4 py-2 font-medium">Pair</th>
                  <th className="px-4 py-2 font-medium">Direction</th>
                  <th className="px-4 py-2 font-medium">Exchange</th>
                  <th className="px-4 py-2 font-medium">Entry</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 text-right font-medium">Move</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.public_id} className="border-t border-border hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fmtUtc(r.fired_at)}</td>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/signals/${r.public_id}`} className="hover:text-primary hover:underline">
                        {displayPair(r.symbol)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className={r.side === 'short' ? 'text-rose-400' : 'text-emerald-400'}>
                        {sideLabel(r.side)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.exchange.toUpperCase()}</td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">${fmtPrice(r.entry_price)}</td>
                    <td className="px-4 py-2"><ResultBadge r={r} /></td>
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${
                        r.status.startsWith('tp')
                          ? 'text-emerald-400'
                          : r.status === 'sl' ? 'text-rose-400' : 'text-muted-foreground'
                      }`}
                    >
                      {r.move_pct != null ? fmtPct(r.move_pct) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination — links preserve the active filters ───────────────── */}
        {page.pages > 1 && (
          <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Archive pagination">
            {page.page > 1 ? (
              <Button asChild variant="outline">
                <Link href={`/signals?${toQuery(filters, { page: page.page - 1 })}`}>← Newer</Link>
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">← Newer</span>
            )}
            <span className="text-sm text-muted-foreground">Page {page.page} of {page.pages}</span>
            {page.page < page.pages ? (
              <Button asChild variant="outline">
                <Link href={`/signals?${toQuery(filters, { page: page.page + 1 })}`}>Older →</Link>
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Older →</span>
            )}
          </nav>
        )}
      </section>

      {/* The record above is free forever — that is what makes the numbers
          believable, so it is never gated. What members buy is TIMING, and this
          prompt says so with the number that proves it: how many trades are
          running right now that a free reader cannot see yet. It is the only ask
          on the page. */}
      <div className="mt-10 flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-foreground">
            {open.hidden > 0
              ? `${open.hidden} signal${open.hidden === 1 ? ' is' : 's are'} live right now.`
              : 'Members see every signal the moment it fires.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A free account sees each signal {FREE_TIER_DELAY_HOURS} hours after it fires. Members get it at fire time
            with the entry, stop and all targets, on a dashboard that refreshes itself every minute.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/signup?next=/account">Create a free account</Link>
        </Button>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/scanner">
            See the live scanner <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <p className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Not financial advice. Trading365 publishes automated technical analysis for research and education. Signals are
        not recommendations to buy or sell, no return is promised or implied, and leveraged crypto trading can lose more
        than you deposit. See our{' '}
        <Link href="/disclaimer" className="underline hover:text-foreground">full disclaimer</Link>.
      </p>
    </div>
  )
}
