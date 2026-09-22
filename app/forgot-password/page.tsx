import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ForgotPasswordForm } from '@/components/forgot-password-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Request a password reset link for your Trading365 account.',
  // Same noindex + self-canonical pairing as /login and /signup. Without the
  // canonical the page would declare the homepage as its canonical URL.
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://trading365.org/forgot-password' },
}

export default function ForgotPasswordPage() {
  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Breadcrumbs items={[{ label: 'Forgot password' }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email and we will send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-8 text-xs text-muted-foreground">
        Still stuck?{' '}
        <Link href="/about" className="underline hover:text-foreground">Get in touch</Link>{' '}
        and we will sort it out.
      </p>
    </div>
  )
}
