'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * A dismissible one-line funnel banner. Dismissal is remembered in
 * sessionStorage, so it returns on a new session but never nags within one.
 *
 * Client-only by necessity: sessionStorage does not exist during SSR. The server
 * therefore renders nothing and the banner appears on mount, which avoids both a
 * hydration mismatch and a flash of a banner the visitor already dismissed.
 *
 * Storage access is wrapped: in private mode or with storage disabled it throws,
 * and the banner is shown rather than silently suppressed — a funnel element
 * that disappears for some visitors is worse than one they dismiss twice.
 */
export function ScannerBanner({
  storageKey,
  children,
  action,
  href,
}: {
  storageKey: string
  children: React.ReactNode
  action: string
  href: string
}) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === '1') return
    } catch {
      /* storage unavailable — fall through and show it */
    }
    setShown(true)
  }, [storageKey])

  if (!shown) return null

  function dismiss() {
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      /* nothing to do */
    }
    setShown(false)
  }

  return (
    <div className="t-panel mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border t-line px-4 py-3">
      <p className="text-sm t-dim">{children}</p>
      <Link href={href} className="text-sm font-semibold t-green hover:underline">
        {action}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this message"
        className="ml-auto rounded px-2 py-0.5 font-mono text-xs t-dim transition-colors hover:text-[var(--t-tx)]"
      >
        ✕
      </button>
    </div>
  )
}
