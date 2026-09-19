import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SESSION_COOKIE, getAccountFromToken } from '@/lib/users'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Trading365 account.',
  robots: { index: false, follow: false },
  // Self-canonical. Without it the page inherits the layout's canonical and so
  // declares the HOMEPAGE as its canonical URL — wrong even on a noindex page,
  // and it was doing that on /signup, /login and /admin alike.
  // noindex + self-canonical is the standard pairing.
  alternates: { canonical: 'https://trading365.org/login' },
}

export default async function LoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (await getAccountFromToken(token)) redirect('/account')

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Breadcrumbs items={[{ label: 'Sign in' }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Welcome back.</p>
      <AuthForm mode="login" />
    </div>
  )
}