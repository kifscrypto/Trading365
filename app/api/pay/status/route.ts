import { NextResponse } from 'next/server'
import { setupSubscribersTable, sql } from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/pay/status?order=...  — polled by the success page. Returns only
// the safe fields needed to show the buyer their join link.
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get('order') ?? ''
  if (!orderId) return NextResponse.json({ error: 'missing order' }, { status: 400 })

  try {
    await setupSubscribersTable()
    const rows = await sql`
      SELECT status, invite_link, expires_at FROM subscribers WHERE order_id = ${orderId} LIMIT 1
    ` as Array<{ status: string; invite_link: string | null; expires_at: string | null }>
    if (!rows.length) return NextResponse.json({ status: 'unknown' })
    const r = rows[0]
    return NextResponse.json({
      status:      r.status,
      invite_link: r.status === 'pending' ? null : r.invite_link,
      expires_at:  r.expires_at,
    })
  } catch (err) {
    console.error('[pay/status]', err)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
}
