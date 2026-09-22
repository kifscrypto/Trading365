'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Same plain-useState approach as components/auth-form.tsx: one field, and the
// simpler code is easier to audit.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.')
        return
      }
      setSent(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-6 space-y-4">
        <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          If <span className="font-mono">{email}</span> has an account, a reset link is on its way. It works once and
          expires in an hour.
        </p>
        {/* The wording above is deliberately conditional. Confirming that an
            account exists would make this form an enumeration tool. */}
        <p className="text-xs text-muted-foreground">
          Nothing arrived? Check your spam folder, then try again in a few minutes — repeat requests are
          rate-limited so the inbox does not fill up.
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline">Back to sign in</Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Please wait…' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline">Back to sign in</Link>
      </p>
    </form>
  )
}
