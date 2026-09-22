'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * `token` is passed in from the page rather than read here with useSearchParams,
 * so this needs no Suspense boundary and the page can reject a missing token
 * server-side before the form is ever rendered.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Checked here rather than server-side only: a typo in the confirmation is
    // the most likely failure, and it should not cost a single-use token.
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/auth/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.')
        return
      }
      // The route signed us in, so go straight to the account rather than to
      // /login. refresh() picks up the new session cookie.
      router.push('/account')
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Please wait…' : 'Set new password'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Setting a new password signs out every other device.
      </p>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline">Back to sign in</Link>
      </p>
    </form>
  )
}
