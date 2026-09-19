import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { postDailySnapshot, previousUtcDay } from '@/lib/discord-snapshot'

// Discord daily snapshot — one embed per UTC day into #daily-snapshots.
// Trigger it on a daily cron the same way as the other scanner routes
// (?cron=true, or Bearer CRON_SECRET, or an authed admin session).
//
// ISOLATION: this route is not called by, and does not call, any scanner route.
// It reads signal_receipts and posts to Discord. If it fails — bad webhook, no
// webhook, Discord down — it returns a JSON error and nothing else moves. It is
// not in the firing path and no scanner route imports it.

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?date=YYYY-MM-DD overrides; the default is the UTC day that just ended, which
  // is what the 00:05 cron wants.
  const dateParam = url.searchParams.get('date')
  const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : previousUtcDay()

  const result = await postDailySnapshot(day)
  return NextResponse.json({ ok: true, ...result })
}