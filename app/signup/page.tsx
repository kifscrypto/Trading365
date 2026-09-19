import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { AuthForm } from '@/components/auth-form'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SESSION_COOKIE, getAccountFromToken } from '@/lib/users'
import { FREE_TIER_DELAY_HOURS, getFiredCountSinceHours } from '@/lib/signals/public'

// Reads the session cookie and a live count, so it can never be statically cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Create a Free Account — Live Crypto Signals | Trading365' },
  description: 'Create a free Trading365 account to follow every signal and its verified result, and manage your access.',
  // A private utility page: noindex, and NOT disallowed in robots.txt — a
  // disallowed URL can never be crawled to see this noindex, which is the
  // standard way sites accidentally leave sign-in pages indexed.
  robots: { index: false, follow: false },
}

const BENEFITS = [
  'Follow every signal and its verified result — entry, targets and outcome',
  'Your own referral link, with a free month for each member you bring',
  'Upgrade any time: members see every signal the moment it fires',
]

export default async function SignupPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (await getAccountFromToken(token)) redirect('/account')

  // Feeds the success state: how many signals fired inside the delay window the
  // free tier sits behind. Null when the table is unreachable, in which case the
  // form drops the line rather than claiming a number it cannot stand behind.
  const firedRecently = await getFiredCountSinceHours(FREE_TIER_DELAY_HOURS)

  return (
    <div className="t-theme">
      <div className="t365-texture z-0" aria-hidden="true" />
      {/* One column, one job, ~600px. The previous layout was max-w-md (448px),
          which left the single field and its button cramped on desktop while the
          surrounding page had room to spare. */}
      <div className="relative z-10 mx-auto w-full max-w-[600px] px-5 py-14 sm:px-6">
        <Breadcrumbs items={[{ label: 'Create account' }]} />

        <p className="mt-8 font-mono text-[11px] tracking-[0.16em] t-green">// FREE ACCOUNT</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Create your free account
        </h1>
        <p className="mt-4 text-sm leading-relaxed t-dim">
          Free tier: every signal {FREE_TIER_DELAY_HOURS} hours after members. No card.
        </p>

        <ul className="mt-8 space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm t-dim">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 t-green" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="t-panel mt-8 rounded-[10px] border t-line p-6 sm:p-7">
          <AuthForm
            mode="signup"
            firedRecently={firedRecently}
            delayHours={FREE_TIER_DELAY_HOURS}
          />
        </div>

        <p className="mt-6 text-xs t-dim">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="underline hover:text-[var(--t-green)]">terms</Link> and{' '}
          <Link href="/privacy" className="underline hover:text-[var(--t-green)]">privacy policy</Link>. Signals are
          automated technical analysis, not financial advice.
        </p>
      </div>
    </div>
  )
}
