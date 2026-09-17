import { NextResponse } from 'next/server'
import { PLANS, isPlanKey, premiumEnabled, createInvoice, newOrderId, setupSubscribersTable, sql } from '@/lib/premium'
import { getSessionUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/pay/create  — SITE membership checkout.
// Body: { plan: 'monthly' | 'quarterly' }. Returns { url } to redirect to.
//
// A signed-in account is required on purpose: the entitlement is attached to a
// user id, so every member ends up with a site account and an email we can
// actually reach — unlike the Telegram-only flow, where the only identity was a
// Telegram user id created after payment.
export async function POST(request: Request) {
  if (!premiumEnabled()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
  }

  const account = await getSessionUser(request)
  if (!account) {
    // `signIn` lets the client send the buyer to /login instead of showing a
    // dead-end error.
    return NextResponse.json({ error: 'Please sign in to continue.', signIn: true }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const plan = String(body?.plan ?? '')
  if (!isPlanKey(plan)) {
    return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 })
  }

  try {
    await setupSubscribersTable()
    const orderId = newOrderId(plan)
    await sql`
      INSERT INTO subscribers (order_id, plan, status, amount_usd, user_id)
      VALUES (${orderId}, ${plan}, 'pending', ${PLANS[plan].amount}, ${account.id})
    `
    const invoiceUrl = await createInvoice(orderId, plan)
    return NextResponse.json({ url: invoiceUrl, order: orderId })
  } catch (err) {
    console.error('[pay/create POST]', err)
    return NextResponse.json({ error: 'Could not start checkout. Try again.' }, { status: 500 })
  }
}

// GET /api/pay/create?plan=monthly|quarterly
// Legacy path: no account, no site access — buys the Telegram channel only.
// Left exactly as it was so existing subscribe links keep working.
export async function GET(request: Request) {
  if (!premiumEnabled()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
  }

  const plan = new URL(request.url).searchParams.get('plan') ?? ''
  if (!isPlanKey(plan)) {
    return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 })
  }

  try {
    await setupSubscribersTable()
    const orderId = newOrderId(plan)
    await sql`
      INSERT INTO subscribers (order_id, plan, status, amount_usd)
      VALUES (${orderId}, ${plan}, 'pending', ${PLANS[plan].amount})
    `
    const invoiceUrl = await createInvoice(orderId, plan)
    return NextResponse.redirect(invoiceUrl, 303)
  } catch (err) {
    console.error('[pay/create]', err)
    return NextResponse.json({ error: 'Could not start checkout. Try again.' }, { status: 500 })
  }
}
