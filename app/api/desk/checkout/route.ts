import { NextResponse } from 'next/server'
import { SITE, setupSubscribersTable, sql } from '@/lib/premium'
import { createDeskInvoice, deskEnabled, DESK_PRODUCT, newDeskOrderId } from '@/lib/desk'
import { getSessionUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!deskEnabled()) {
    return NextResponse.json({ error: 'T365 Desk checkout is not configured yet.' }, { status: 503 })
  }
  const account = await getSessionUser(request)
  if (!account) return NextResponse.json({ error: 'Please sign in to continue.', signIn: true }, { status: 401 })

  try {
    await setupSubscribersTable()
    const orderId = newDeskOrderId()
    await sql`
      INSERT INTO subscribers (order_id, plan, status, amount_usd, user_id, product)
      VALUES (${orderId}, ${DESK_PRODUCT.key}, 'pending', ${DESK_PRODUCT.amount}, ${account.id}, ${DESK_PRODUCT.product})
    `
    const invoiceUrl = await createDeskInvoice(orderId, SITE)
    return NextResponse.json({ url: invoiceUrl, order: orderId })
  } catch (error) {
    console.error('[desk/checkout POST]', error)
    return NextResponse.json({ error: 'Could not start T365 Desk checkout. Try again.' }, { status: 500 })
  }
}
