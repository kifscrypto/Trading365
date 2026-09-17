import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { AuthForm } from '@/components/auth-form'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SESSION_COOKIE, getAccountFromToken } from '@/lib/users'

// Reads the session cookie, so it can never be statically cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Create your free account',
  description: 'Create a Trading365 account to follow the signal track record and manage your access.',
  // A private utility page: noindex, and NOT disallowed in robots.txt — a
  // disallowed URL can never be crawled to see this noindex, which is the
  // standard way sites accidentally leave sign-in pages indexed.
  robots: { index: false, follow: false },
}

const BENEFITS = [
  'Follow the full signal archive — every entry, target and result',
  'Your own referral link, with a free month for each member you bring',
  'Upgrade to live signals the moment membership opens',
]

export default async function SignupPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (await getAccountFromToken(token)) redirect('/account')

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Breadcrumbs items={[{ label: 'Create account' }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Create your free account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One account for the scanner, the signal archive and your referrals. No card needed.
      </p>

      <ul className="mt-6 space-y-2">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <AuthForm mode="signup" />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="underline hover:text-foreground">terms</Link> and{' '}
        <Link href="/privacy" className="underline hover:text-foreground">privacy policy</Link>. Signals are
        automated technical analysis, not financial advice.
      </p>
    </div>
  )
}