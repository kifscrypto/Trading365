'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export interface PlanOption {
  key: string
  label: string
  amount: number
  days: number
}

/**
 * Membership checkout buttons.
 *
 * POSTs to /api/pay/create and redirects to the NOWPayments invoice. The account
 * is the identity that receives the entitlement, so an anonymous visitor is sent
 * to sign in first rather than being shown a dead end.
 *
 * `renewing` is set for someone who is ALREADY a member. The buttons are identical
 * — grantEntitlement adds the new term to whatever they have left — but the copy
 * has to say so, because a member's first question on seeing a price is whether
 * buying now throws away the time they have already paid for. It does not.
 */
export function UpgradeButtons({ plans, signedIn, renewing }: { plans: PlanOption[]; signedIn: boolean; renewing?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function start(plan: string) {
    setError('')
    if (!signedIn) {
      router.push('/login?next=/account')
      return
    }
    setBusy(plan)
    try {
      const res = await fetch('/api/pay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 && data?.signIn) {
        router.push('/login?next=/account')
        return
      }
      if (res.ok && typeof data?.url === 'string') {
        // Leave the app for the hosted crypto checkout.
        window.location.href = data.url
        return
      }
      setError(typeof data?.error === 'string' ? data.error : 'Could not start checkout. Please try again.')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {plans.map((p) => (
          <Button key={p.key} onClick={() => start(p.key)} disabled={busy !== null}>
            {busy === p.key ? 'Starting checkout…' : `${p.label} — $${p.amount} / ${p.days} days`}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {renewing
          ? 'Adds to the end of your current term rather than replacing it — buy today and you keep every day you have left. Paid in crypto via NOWPayments. No auto-renewal, nothing to cancel.'
          : 'Paid in crypto (USDT, ETH and others) via NOWPayments at checkout. Access runs to the end of your term — there is no auto-renewal and nothing to cancel.'}
      </p>
    </div>
  )
}