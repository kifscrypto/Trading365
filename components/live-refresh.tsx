'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Re-fetches the server component on an interval so the live signal view stays
 * current without a websocket or a client-side data layer. router.refresh()
 * re-renders the server tree in place (no full reload, no lost client state).
 */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])
  return null
}