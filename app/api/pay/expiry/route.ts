import { NextResponse } from 'next/server'
import { removeMember, setupSubscribersTable, sql } from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily cron: remove members whose term has lapsed.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const authed =
    url.searchParams.get('cron') === 'true' ||
    request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    await setupSubscribersTable()
    // Active members past expiry → kick + mark expired.
    const expired = await sql`
      SELECT order_id, tg_user_id FROM subscribers
      WHERE status = 'active' AND tg_user_id IS NOT NULL AND expires_at < NOW()
    ` as Array<{ order_id: string; tg_user_id: number }>

    let removed = 0
    for (const s of expired) {
      try {
        await removeMember(Number(s.tg_user_id))
        await sql`UPDATE subscribers SET status = 'expired', removed_at = NOW() WHERE order_id = ${s.order_id}`
        removed++
      } catch (e) {
        console.error('[pay/expiry] remove failed', s.order_id, e)
      }
    }

    // Paid-but-never-joined and lapsed → just mark expired (nothing to remove).
    await sql`
      UPDATE subscribers SET status = 'expired'
      WHERE status = 'paid' AND tg_user_id IS NULL AND expires_at < NOW()
    `
    return NextResponse.json({ ok: true, removed, checked: expired.length })
  } catch (err) {
    console.error('[pay/expiry]', err)
    return NextResponse.json({ error: 'sweep failed' }, { status: 500 })
  }
}
