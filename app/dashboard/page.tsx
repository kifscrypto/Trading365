import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowRight, Lock, Radio, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LiveRefresh } from '@/components/live-refresh'
import { OpenSignalCard } from '@/components/open-signal-card'
import { ScannerBanner } from '@/components/scanner-banner'
import { SESSION_COOKIE, getAccountFromToken } from '@/lib/users'
import { FREE_TIER_DELAY_HOURS, getOpenSignals } from '@/lib/signals/public'

// Session-scoped and always current: never prerendered, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Signal dashboard',
  robots: { index: false, follow: false },
}

export default async function DashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const account = await getAccountFromToken(token)
  const isPaid = account?.tier === 'paid'
  const isFree = account?.tier === 'free'

  // One query serves all three tiers: members see everything, everyone else sees
  // only what has already passed the delay. Anonymous visitors are shown the
  // COUNT of live signals (rows + hidden) and never their details.
  const open = await getOpenSignals({ includeAll: isPaid })
  const liveNow = open.rows.length + open.hidden

  return (
    /* The terminal theme is opt-in per page: .t-theme repaints Tailwind's
       semantic tokens for everything inside it (see globals.css). The extra
       full-width wrapper exists so the surface background spans the viewport
       rather than just the centred column. */
    <div className="t-theme">
      <div className="t365-texture z-0" aria-hidden="true" />
      <div className="relative z-10 container mx-auto max-w-5xl px-4 py-12">
      <Breadcrumbs items={[{ label: 'Dashboard' }]} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Signal dashboard</h1>
        {isPaid ? (
          <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Radio className="h-3 w-3" /> Live
          </Badge>
        ) : isFree ? (
          <Badge className="border-border bg-muted/40 text-muted-foreground">
            Free · {FREE_TIER_DELAY_HOURS}h delayed
          </Badge>
        ) : (
          <Badge className="border-border bg-muted/40 text-muted-foreground">Not signed in</Badge>
        )}
      </div>

      {!account ? (
        /* ── Anonymous: proof of the gate, none of the content ───────────── */
        <>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Signals that are running right now are reserved for members. Each one is published publicly only once it has
            resolved — that is what keeps the live alerts from being given away.
          </p>
          {/* Funnel (b): the anonymous banner. Dismissible per session so it never
              nags, and it states the delay plainly rather than hiding it — the
              delay is the product, not a defect to be glossed over. */}
          <ScannerBanner
            storageKey="t365-anon-banner"
            href="/signup?next=/dashboard"
            action="Join free →"
          >
            Members see signals live. Free tier: {FREE_TIER_DELAY_HOURS}h delay.
          </ScannerBanner>
          <div className="mt-6 flex gap-3 rounded-xl border border-border bg-card p-6">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">
                {liveNow > 0
                  ? `${liveNow} signal${liveNow === 1 ? '' : 's'} live right now.`
                  : 'No signals are open at this moment.'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A free account shows open signals after a {FREE_TIER_DELAY_HOURS}-hour delay. Members see each one the
                moment it fires, on this site rather than in Telegram.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/signup?next=/dashboard">Create a free account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/login?next=/dashboard">Sign in</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/signals">Browse verified results</Link>
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ─ Free or member ─────────────────────────────────────────────── */
        <>
          {isPaid && <LiveRefresh seconds={60} />}
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {isPaid
              ? 'Every signal the scanner has fired that has not resolved yet, shown as it fires. This page refreshes itself once a minute.'
              : `Signals that have been running for more than ${FREE_TIER_DELAY_HOURS} hours. Members see each one the moment it fires instead.`}
          </p>

          {isFree && open.hidden > 0 && (
            <div className="mt-6 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">
                  {open.hidden} signal{open.hidden === 1 ? ' is' : 's are'} live but not visible to you yet.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;re on the {FREE_TIER_DELAY_HOURS}h-delayed free tier. Members see these the moment they fire,
                  with entry, targets and stop.
                </p>
                {/* Funnel (c): the free-tier upgrade prompt, driven by the same
                    open.hidden count the gate already computes. */}
                <Button asChild size="sm" className="mt-3">
                  <Link href="/account">
                    Upgrade to live <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {open.rows.length === 0 ? (
            /* Funnel (a): the honest empty state. An empty book is the gate
               working, not the product failing, and saying so plainly is more
               persuasive than a spinner. It still ends somewhere real. */
            <div className="t-panel mt-6 rounded-[10px] border t-line p-8 text-center">
              <p className="font-semibold">The gate stood the book down.</p>
              <p className="mt-1 text-sm t-dim">
                No signals are open — the scanner only fires when conditions favour the trade, and it stays
                deliberately quiet when they don&apos;t. Signals resume when conditions clear.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/signals">See the verified archive</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {open.rows.map((r) => <OpenSignalCard key={r.public_id} r={r} live={isPaid} />)}
            </div>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            Not financial advice — automated technical analysis for research and education; no return is promised or
            implied. See our <Link href="/disclaimer" className="underline hover:text-foreground">full disclaimer</Link>.
            Every resolved signal is published in full under{' '}
            <Link href="/signals" className="underline hover:text-foreground">verified results</Link>.
          </p>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/account">Your account <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </Button>
      </div>
    </div>
      </div>

  )
}