import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowRight, Gift, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { siteConfig } from '@/lib/data/site-config'
import { SESSION_COOKIE, getAccountFromToken } from '@/lib/users'
import { PLANS, getSubscriberAccess } from '@/lib/premium'
import { FREE_TIER_DELAY_HOURS } from '@/lib/signals/public'
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
  const access = await getSubscriberAccess(account.id)
  const plans: PlanOption[] = Object.values(PLANS).map((p) => ({
    key: p.key, label: p.label, amount: p.amount, days: p.days,
  }))

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Breadcrumbs items={[{ label: 'Account' }]} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <Badge
          className={
            isPaid
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-border bg-muted/40 text-muted-foreground'
          }
        >
          {isPaid ? 'Member' : 'Free'}
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

      {/* ── Membership ─────────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-xl border border-border bg-card p-5">
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
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">
              {isPaid ? 'Live signal dashboard' : 'Signal dashboard'} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signals">Verified results</Link>
          </Button>
        </div>
      </section>

      {/* ── Referral ───────────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
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
      </section>

      {/* ── Account details ────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
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

      <p className="mt-6 text-xs text-muted-foreground">
        Questions about your account? <Link href="/about#contact" className="underline hover:text-foreground">Contact us</Link>.
      </p>
    </div>
  )
}