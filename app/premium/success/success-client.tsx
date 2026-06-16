'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = { status: string; invite_link: string | null; expires_at: string | null }

export default function SuccessClient() {
  const order = useSearchParams().get('order') ?? ''
  const [data, setData] = useState<Status | null>(null)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!order) return
    let alive = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/pay/status?order=${encodeURIComponent(order)}`, { cache: 'no-store' })
        const j: Status = await r.json()
        if (!alive) return
        setData(j)
        if (j.status !== 'pending' && j.invite_link) return // done — stop polling
      } catch { /* ignore, retry */ }
      if (alive) setTimeout(() => setTries(t => t + 1), 3000)
    }
    tick()
    return () => { alive = false }
  }, [order, tries])

  const ready = data && data.status !== 'pending' && data.invite_link

  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      {!order ? (
        <p className="text-muted-foreground">Missing order reference.</p>
      ) : ready ? (
        <>
          <h1 className="text-2xl font-bold text-foreground">Payment received ✅</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Tap below to join the private premium signals channel. You&apos;ll be approved automatically.
          </p>
          <a
            href={data!.invite_link!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Join the premium channel →
          </a>
          <p className="mt-6 text-xs text-muted-foreground/70">
            Keep this link private — it&apos;s tied to your subscription. Access runs until{' '}
            {data!.expires_at ? new Date(data!.expires_at).toLocaleDateString() : 'your term ends'}.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-foreground">Confirming your payment…</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This page updates automatically once the network confirms your transaction (usually a minute or two).
            Leave it open.
          </p>
          <div className="mt-8 h-1.5 w-40 mx-auto overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        </>
      )}
    </main>
  )
}
