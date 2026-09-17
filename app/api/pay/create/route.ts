import { NextResponse } from 'next/server'
import { PLANS, SITE, isPlanKey, premiumEnabled, createInvoice, newOrderId, setupSubscribersTable, sql } from '@/lib/premium'
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
//
// This used to start a Telegram-only order right here (no account, user_id NULL),
// which meant a GET mutated state — so anything that follows links created
// orders. The subscribers table holds 163 of them across 56 days, including
// monthly+quarterly pairs 0.3 seconds apart (not humanly clickable), and every
// one of those also minted a NOWPayments invoice. Junk orders are only the
// visible half: they also make the table useless as a record of demand.
//
// Legacy links now hand the visitor to the account-first flow instead, so a
// crawler cannot create an order and a buyer cannot end up outside the account
// system. Nothing is written and no invoice is created on this request — the
// checkout happens after sign-in, through POST, where it can be attributed.
export async function GET(request: Request) {
  if (!premiumEnabled()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
  }

  // The plan the legacy link asked for is deliberately not honoured: it would have
  // to be carried through signup to mean anything, and both plans are offered side
  // by side on /account anyway.
  return NextResponse.redirect(new URL('/signup?next=/account', SITE), 303)
}
