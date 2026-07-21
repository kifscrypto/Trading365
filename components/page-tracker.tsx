'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// 30-minute inactivity window — the standard session model (GA/Plausible). A new
// page view within 30 min of the last activity continues the same session; a gap
// longer than that (or a fresh visit) starts a new one. Stored in localStorage so a
// session survives reloads and cross-page navigation but still expires when idle.
const SESSION_WINDOW_MS = 30 * 60 * 1000
const SID_KEY = 't365_sid'
const SID_TS_KEY = 't365_sid_ts'

function getSessionId(): string {
  try {
    const now = Date.now()
    const last = Number(localStorage.getItem(SID_TS_KEY) || 0)
    let sid = localStorage.getItem(SID_KEY)
    if (!sid || !last || now - last > SESSION_WINDOW_MS) {
      // crypto.randomUUID is available in every browser that runs our JS; the
      // fallback keeps us safe on ancient/locked-down environments.
      sid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
    localStorage.setItem(SID_KEY, sid)
    localStorage.setItem(SID_TS_KEY, String(now))
    return sid
  } catch {
    // localStorage blocked (private mode / cookies off) — degrade to a per-view id
    // so tracking still fires; this hit just won't group into a session.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function PageTrackerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    let rowId: number | null = null
    const enteredAt = Date.now()
    let maxScroll = 0
    let sent = false

    // Track the deepest scroll position reached, as a percentage of the total
    // scrollable height. A page that fits on screen with nothing to scroll counts
    // as 100% (the visitor saw all of it).
    const onScroll = () => {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - doc.clientHeight
      const pct = scrollable <= 0 ? 100 : Math.round((doc.scrollTop / scrollable) * 100)
      if (pct > maxScroll) maxScroll = pct
    }
    onScroll()

    // Fire the engagement beacon exactly once, on the first leave/hide signal.
    // sendBeacon is fire-and-forget so it never blocks the unload.
    const sendEngagement = () => {
      if (sent || rowId == null) return
      sent = true
      const payload = JSON.stringify({
        id: rowId,
        duration_ms: Date.now() - enteredAt,
        scroll_pct: maxScroll,
      })
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/track/engage', new Blob([payload], { type: 'application/json' }))
        } else {
          fetch('/api/track/engage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
        }
      } catch {
        // ignore — tracking must never throw into the page
      }
    }

    const onHide = () => {
      // visibilitychange:hidden is the most reliable "leaving" signal on mobile
      // (pagehide/beforeunload are unreliable there); pagehide covers desktop.
      if (document.visibilityState === 'hidden') sendEngagement()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', sendEngagement)

    // Record the page view; keep the returned row id to backfill engagement later.
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        session_id: getSessionId(),
        utm_source: searchParams.get('utm_source'),
        utm_medium: searchParams.get('utm_medium'),
        utm_campaign: searchParams.get('utm_campaign'),
      }),
    })
      .then(r => r.json())
      .then(d => { rowId = typeof d?.id === 'number' ? d.id : null })
      .catch(() => {})

    // On client-side route change, this cleanup runs before the next view mounts —
    // flush engagement for the page being left (SPA navigation fires no unload).
    return () => {
      sendEngagement()
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', sendEngagement)
    }
  }, [pathname, searchParams])

  return null
}

export function PageTracker() {
  return (
    <Suspense fallback={null}>
      <PageTrackerInner />
    </Suspense>
  )
}
