import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowRight, Gift, Radio, Send, ShieldCheck, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LiveRefresh } from '@/components/live-refresh'
import { OpenSignalCard } from '@/components/open-signal-card'
import { siteConfig } from '@/lib/data/site-config'
import { SESSION_COOKIE, getAccountFromToken, getReferralStats } from '@/lib/users'
import { PLANS, getSubscriberAccess } from '@/lib/premium'
import { FREE_TIER_DELAY_HOURS, getOpenSignals } from '@/lib/signals/public'
import { FREE_CHANNEL_INVITE } from '@/lib/telegram'
import { UpgradeButtons, type PlanOption } from '@/components/upgrade-buttons'

// Session-scoped content: never prerendered, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

// The account home shows only the freshest few open signals — the full book
// stays on /dashboard. Four fills a wide row without pushing the account
// panels below a second screen.
const PREVIEW_COUNT = 4

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const account = await getAccountFromToken(token)
  if (!account) redirect('/login?next=/account')

  // Where NOWPayments sends an abandoned checkout. This used to be
  // /scanner?checkout=cancelled — a parameter no page has ever read — so cancelling
  // looked exactly like an ordinary visit: no acknowledgement, and the plan buttons
  // a page away. The membership lives here, so the return trip does too.
  const { checkout } = await searchParams

  const isPaid = account.tier === 'paid'
  const referralUrl = `${siteConfig.url}/signup?ref=${account.referral_code}`
  // Telegram is an OPT-IN surface: the invite is minted at payment time, but a
  // member who ignores it keeps full site access.
  const [access, referralStats, open] = await Promise.all([
    getSubscriberAccess(account.id),
    getReferralStats(account.id, account.referral_code),
    // Same tiered read the dashboard uses: members see the live book, the free
    // tier sees only what has passed the delay plus a COUNT of what it is missing.
    getOpenSignals({ includeAll: isPaid }),
  ])
  const plans: PlanOption[] = Object.values(PLANS).map((p) => ({
    key: p.key, label: p.label, amount: p.amount, days: p.days,
  }))
  const preview = open.rows.slice(0, PREVIEW_COUNT)
  const moreCount = open.rows.length - preview.length

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      {isPaid && <LiveRefresh seconds={60} />}
      <Breadcrumbs items={[{ label: 'Account' }]} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <Badge
          className={
            isPaid
              ? 'gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-border bg-muted/40 text-muted-foreground'
          }
        >
          {isPaid ? <><Radio className="h-3 w-3" /> Member · live</> : `Free · ${FREE_TIER_DELAY_HOURS}h delayed`}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{account.email}</p>

      {checkout === 'cancelled' && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-200/90"
        >
          Checkout cancelled — nothing was charged and your card or crypto was not touched. The plans are just below
          whenever you want to pick one up.
        </div>
      )}

      {/* ── Live signals ───────────────────────────────────────────────────── */}
      {/* The reason the account exists, so it leads the page. Members see the
          freshest open signals as they fire; the free tier sees the delayed
          ones and an honest count of what membership would unlock. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Live signals</h2>
            {isPaid ? (
              <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {open.rows.length} open
              </Badge>
            ) : (
              <Badge className="border-border bg-muted/40 text-muted-foreground">
                {FREE_TIER_DELAY_HOURS}h delayed
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/dashboard">
                Full dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/signals">Verified results</Link>
            </Button>
          </div>
        </div>

        {isFreeHiddenPrompt(isPaid, open.hidden) && (
          <div className="mt-4 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">
                {open.hidden} signal{open.hidden === 1 ? ' is' : 's are'} live right now but not visible to you yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;re on the {FREE_TIER_DELAY_HOURS}h-delayed free tier. Members see every signal the moment it
                fires, with entry, targets and stop.
              </p>
            </div>
          </div>
        )}

        {preview.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center">
            <p className="font-semibold">No signals open right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The scanner only fires when conditions favour the trade and stays quiet when they don&apos;t. Every
              resolved signal is in the <Link href="/signals" className="underline hover:text-foreground">verified archive</Link>.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {preview.map((r) => <OpenSignalCard key={r.public_id} r={r} live={isPaid} />)}
            </div>
            {moreCount > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Plus {moreCount} more open signal{moreCount === 1 ? '' : 's'} on the{' '}
                <Link href="/dashboard" className="underline hover:text-foreground">full dashboard</Link>.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Account panels — two columns on wide screens ───────────────────── */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* ── Membership ───────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Membership</h2>
          {isPaid ? (
            <>
              <p className="mt-2 text-sm">
                Live signal access is active
                {account.paid_until ? (
                  <> until <span className="font-semibold">{formatDate(account.paid_until)}</span></>
                ) : (
                  <> with no expiry</>
                )}
                .
              </p>
              {access?.invite_link ? (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    Telegram alerts are included too. Join the private channel if you want them there as well — site access
                    does not depend on it.
                  </p>
                  <Button asChild variant="outline" className="mt-3">
                    <a href={access.invite_link} target="_blank" rel="noopener noreferrer">
                      Join the Telegram channel (optional)
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Everything is published here on the site — you don&apos;t need Telegram to use your membership.
                </p>
              )}
              {/* Renewal. Only for a FINITE term: a lifetime grant has nothing to add
                  to, and buying one would set paid_until to a date — making a
                  permanent membership look like it expires. */}
              {account.paid_until && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-sm font-medium">Extend your membership</p>
                  <UpgradeButtons plans={plans} signedIn renewing />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                You&apos;re on the free tier — signals appear here once they have been running for{' '}
                {FREE_TIER_DELAY_HOURS} hours. Membership shows every signal the moment it fires.
              </p>
              <UpgradeButtons plans={plans} signedIn />
            </>
          )}
        </section>

        {/* ── Free channel ─────────────────────────────────────────────────── */}
        {/* Shown to EVERY signed-in user, not just members: the free channel is
            private now, so this is the only place its invite exists. It used to
            be a public @username that anyone could follow. */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Send className="h-4 w-4" /> Telegram
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The free channel is private, so the invite only lives here — there is no public link to
            join. Same signals as the free tier on the site, just delivered to Telegram, which is
            easier if you would rather monitor there.
          </p>
          <Button asChild variant="outline" className="mt-3">
            <a href={FREE_CHANNEL_INVITE} target="_blank" rel="noopener noreferrer">
              Join the free channel
            </a>
          </Button>
          {isPaid && (
            <p className="mt-3 text-xs text-muted-foreground">
              That is the free channel, which runs {FREE_TIER_DELAY_HOURS} hours behind. Your member
              channel — every signal the moment it fires — is in the Membership panel above.
            </p>
          )}
        </section>

        {/* ── Referral ─────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Gift className="h-4 w-4" /> Referral
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Share your link. When someone you refer becomes a member, you get a free month added to your account.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
              {account.referral_code}
            </code>
            <span className="break-all font-mono text-xs text-muted-foreground">{referralUrl}</span>
          </div>
          {/* The numbers behind the promise above. Shown even at zero: a counter that
              only appears once it is non-zero reads as decoration, and this one is
              the only evidence a member has that a referral actually landed. */}
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Signed up</dt>
              <dd className="mt-0.5 tabular-nums">{referralStats.referred}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Became members</dt>
              <dd className="mt-0.5 tabular-nums">{referralStats.conversions}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Free days earned</dt>
              <dd className="mt-0.5 tabular-nums text-emerald-400">{referralStats.daysEarned}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            A free month is added when your referral&apos;s first payment clears, and it extends your membership from
            wherever it currently ends rather than running alongside it.
          </p>
        </section>

        {/* ── Account details ──────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Details
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Member since</dt>
              <dd className="mt-0.5">{formatDate(account.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last sign-in</dt>
              <dd className="mt-0.5">{formatDate(account.last_login_at)}</dd>
            </div>
          </dl>
          <form action="/api/auth/logout" method="post" className="mt-5">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </section>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Questions about your account? <Link href="/about#contact" className="underline hover:text-foreground">Contact us</Link>.
      </p>
    </div>
  )
}

function isFreeHiddenPrompt(isPaid: boolean, hidden: number): boolean {
  return !isPaid && hidden > 0
}
