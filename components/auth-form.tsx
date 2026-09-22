'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Mirrors the plain-useState approach of app/admin/login/page.tsx rather than
// react-hook-form: these are two fields, and the simpler code is easier to audit.
interface AuthFormProps {
  mode: 'signup' | 'login'
  /** Signals that fired inside the free-tier delay window, fetched server-side. */
  firedRecently?: number | null
  /**
   * The delay itself, passed in rather than imported. lib/signals/public.ts
   * creates a Neon client at module scope, so a client component must never
   * import from it — doing so would pull the DB module into the browser bundle.
   */
  delayHours?: number
}

function AuthFormInner({ mode, firedRecently, delayHours }: AuthFormProps) {
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
  const [done, setDone] = useState(false)

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
        // Signup lands on a success screen rather than redirecting instantly, so
        // the "while you waited" line is actually read instead of flashing past.
        // Login keeps the direct redirect — it is not a conversion surface.
        if (isSignup) {
          setDone(true)
          return
        }
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

  if (done && isSignup) {
    const n = typeof firedRecently === 'number' ? firedRecently : null
    const hours = delayHours ?? 6
    return (
      <div className="mt-8">
        <p className="font-mono text-[11px] tracking-[0.16em] t-green">// ACCOUNT CREATED</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight">You&apos;re in.</h2>
        <p className="mt-3 text-sm t-dim">
          {n !== null && n > 0 ? (
            <>
              While you waited:{' '}
              <span className="font-mono font-bold t-green">{n.toLocaleString('en-US')}</span>{' '}
              signal{n === 1 ? '' : 's'} fired in the last {hours} hours — members saw them live.
            </>
          ) : (
            <>Your account is ready. Members see every signal the moment it fires.</>
          )}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/scanner"
            className="inline-flex items-center justify-center rounded-[10px] bg-[var(--t-green)] px-6 py-3 text-sm font-semibold text-[#04140B] transition hover:brightness-110"
          >
            Open the live scanner →
          </Link>
          <Link
            href="/signals"
            className="inline-flex items-center justify-center rounded-[10px] border t-line px-6 py-3 text-sm font-semibold transition hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
          >
            Browse the verified archive
          </Link>
        </div>
        <p className="mt-5 text-xs t-dim">
          <Link href={next} className="underline hover:text-[var(--t-green)]">
            Continue to your account →
          </Link>
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
        {!isSignup && (
          <p className="text-xs text-muted-foreground">
            <Link href="/forgot-password" className="underline hover:text-foreground">Forgot your password?</Link>
          </p>
        )}
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
export function AuthForm({ mode, firedRecently, delayHours }: AuthFormProps) {
  return (
    <Suspense fallback={<div className="mt-6 h-72" />}>
      <AuthFormInner mode={mode} firedRecently={firedRecently} delayHours={delayHours} />
    </Suspense>
  )
}