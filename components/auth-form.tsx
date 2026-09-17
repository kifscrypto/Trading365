'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Mirrors the plain-useState approach of app/admin/login/page.tsx rather than
// react-hook-form: these are two fields, and the simpler code is easier to audit.
function AuthFormInner({ mode }: { mode: 'signup' | 'login' }) {
  const router = useRouter()
  const params = useSearchParams()
  const isSignup = mode === 'signup'

  // ?ref=CODE is attached by referral share links.
  const ref = params.get('ref') ?? ''
  // ?next= — where to land after signing in. Only same-origin paths are honoured
  // (a protocol-relative //evil.com would otherwise be an open redirect).
  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/auth/${isSignup ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ref: ref || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        router.push(next)
        router.refresh()
        return
      }
      setError(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.')
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
      {isSignup && ref && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Referral code <span className="font-mono text-foreground">{ref}</span> will be applied to your account.
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
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isSignup && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline">Sign in</Link>
          </>
        ) : (
          <>
            No account yet?{' '}
            <Link href="/signup" className="text-primary underline">Create one — it&apos;s free</Link>
          </>
        )}
      </p>
    </form>
  )
}

// useSearchParams requires a Suspense boundary during prerender (same pattern as
// app/admin/login/page.tsx).
export function AuthForm({ mode }: { mode: 'signup' | 'login' }) {
  return (
    <Suspense fallback={<div className="mt-6 h-72" />}>
      <AuthFormInner mode={mode} />
    </Suspense>
  )
}