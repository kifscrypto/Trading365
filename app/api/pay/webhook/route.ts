import { NextResponse } from 'next/server'
import {
  PLANS, isPlanKey, PAID_STATUSES, verifyIpnSignature,
  createPremiumInvite, setupSubscribersTable, sql,
} from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// NOWPayments IPN callback. Fires on every status change; we act only on
// confirmed/finished and are idempotent (a second paid IPN is a no-op).
export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyIpnSignature(raw, request.headers.get('x-nowpayments-sig'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const orderId = String(body.order_id ?? '')
  const status  = String(body.payment_status ?? '')
  if (!orderId) return NextResponse.json({ ok: true }) // nothing to do

  // Acknowledge non-final statuses without changing state.
  if (!PAID_STATUSES.has(status)) return NextResponse.json({ ok: true, status })

  try {
    await setupSubscribersTable()
    const rows = (await sql`SELECT plan, status FROM subscribers WHERE order_id = ${orderId} LIMIT 1`) as Array<{ plan: string; status: string }>
    if (!rows.length) return NextResponse.json({ ok: true }) // unknown order — ignore
    if (rows[0].status !== 'pending') return NextResponse.json({ ok: true, already: rows[0].status }) // idempotent

    const plan = rows[0].plan
    const days = isPlanKey(plan) ? PLANS[plan].days : 30
    const invite = await createPremiumInvite(orderId)

    await sql`
      UPDATE subscribers
      SET status      = 'paid',
          payment_id  = ${String(body.payment_id ?? '')},
          paid_at     = NOW(),
          expires_at  = NOW() + (${days} * INTERVAL '1 day'),
          invite_link = ${invite}
      WHERE order_id = ${orderId}
    `
    return NextResponse.json({ ok: true, activated: true })
  } catch (err) {
    console.error('[pay/webhook]', err)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
