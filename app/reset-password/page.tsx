import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ResetPasswordForm } from '@/components/reset-password-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your Trading365 account.',
  robots: { index: false, follow: false },
  // Self-canonical without the query string, so the token is never advertised as
  // part of the page's canonical URL.
  alternates: { canonical: 'https://trading365.org/reset-password' },
}

/**
 * A missing token is rejected here rather than by the form, so the failure is
 * visible before the user types a password into a form that could never work.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <Breadcrumbs items={[{ label: 'Reset password' }]} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">This link is incomplete</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The reset link is missing its token. It may have been cut in half by your email client — try
          copying the whole link, or request a new one.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password" className="text-primary underline">Request a new reset link</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Breadcrumbs items={[{ label: 'Reset password' }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You will be signed in once it is set.
      </p>
      <ResetPasswordForm token={token} />
    </div>
  )
}
