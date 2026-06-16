import { NextResponse } from 'next/server'
import { PLANS, isPlanKey, premiumEnabled, createInvoice, newOrderId, setupSubscribersTable, sql } from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/pay/create?plan=monthly|quarterly
// Creates a NOWPayments invoice + a pending subscriber row, then redirects to checkout.
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
