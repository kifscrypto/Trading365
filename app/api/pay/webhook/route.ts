import { NextResponse } from 'next/server'
import {
  PLANS, isPlanKey, PAID_STATUSES, verifyIpnSignature,
  createPremiumInvite, setupSubscribersTable, sql,
} from '@/lib/premium'
import { grantEntitlement, grantReferralReward, getAccount } from '@/lib/users'
import { accessGrantedEmail, emailConfigured, sendEmail } from '@/lib/email'

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
    const rows = (await sql`
      SELECT plan, status, user_id FROM subscribers WHERE order_id = ${orderId} LIMIT 1
    `) as Array<{ plan: string; status: string; user_id: number | null }>
    if (!rows.length) return NextResponse.json({ ok: true }) // unknown order — ignore
    if (rows[0].status !== 'pending') return NextResponse.json({ ok: true, already: rows[0].status }) // idempotent

    const plan = rows[0].plan
    const days = isPlanKey(plan) ? PLANS[plan].days : 30

    // Grant SITE access FIRST. The grant is idempotent on (source, external_id),
    // so if anything below throws, this order stays 'pending' and NOWPayments'
    // retry re-runs the whole block — a retry can never silently skip the
    // entitlement, and can never double-grant either.
    let referral: { granted: boolean; reason?: string } = { granted: false, reason: 'no-site-account' }
    if (rows[0].user_id) {
      await grantEntitlement(Number(rows[0].user_id), {
        source: 'nowpayments',
        externalId: orderId,
        days,
      })
      // The referee has now CONVERTED, which is the trigger /account promises the
      // referrer a free month for. Deliberately after the buyer's own grant and
      // deliberately non-fatal: grantReferralReward() never throws, so a referral
      // problem can neither cost the buyer their access nor make the processor
      // retry a block that already succeeded. Idempotent per referee, so a retried
      // webhook and a second purchase both pay the referrer exactly once.
      referral = await grantReferralReward(Number(rows[0].user_id))
      if (referral.granted) {
        console.log(`[pay/webhook] referral reward granted for referee ${rows[0].user_id}`)
      }
    }

    // Telegram stays a secondary surface: the invite is still minted here, but
    // site access does not depend on it and the member only uses it if they
    // choose to from /account.
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

    // Confirmation email, AFTER the row is marked paid so we only ever confirm a
    // purchase that actually completed. Same reasoning as the comp grant, only
    // more so: money changed hands, and silence here is indistinguishable from
    // the purchase having failed.
    //
    // Non-fatal by construction — sendEmail() never throws, so a provider outage
    // cannot turn this into a 500 and make NOWPayments retry a block that already
    // succeeded. The buyer keeps their access either way.
    if (rows[0].user_id && emailConfigured()) {
      try {
        const buyer = await getAccount(Number(rows[0].user_id))
        if (buyer) {
          const sent = await sendEmail(
            accessGrantedEmail({ email: buyer.email, days, source: 'nowpayments' }),
          )
          if (!sent.ok) {
            console.error(`[pay/webhook] confirmation email failed (${sent.status}) for order ${orderId}`)
          }
        }
      } catch (err) {
        console.error(`[pay/webhook] confirmation email threw for order ${orderId}:`, err)
      }
    }

    return NextResponse.json({ ok: true, activated: true, siteAccess: !!rows[0].user_id, referral })
  } catch (err) {
    console.error('[pay/webhook]', err)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
