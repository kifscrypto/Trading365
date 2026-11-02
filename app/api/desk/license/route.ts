import { NextResponse } from 'next/server'
import { setupSubscribersTable, sql } from '@/lib/premium'
import { DESK_PRODUCT } from '@/lib/desk'
import { getSessionUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const account = await getSessionUser(request)
  if (!account) return NextResponse.json({ error: 'Please sign in to continue.', signIn: true }, { status: 401 })
  const orderId = new URL(request.url).searchParams.get('order')
  if (!orderId) return NextResponse.json({ error: 'Order ID is required.' }, { status: 400 })

  await setupSubscribersTable()
  const rows = await sql`
    SELECT order_id, license_key, license_updates_until
    FROM subscribers
    WHERE order_id = ${orderId} AND user_id = ${account.id}
      AND product = ${DESK_PRODUCT.product} AND status IN ('paid', 'active') AND license_key IS NOT NULL
    LIMIT 1
  ` as unknown as Array<{ order_id: string; license_key: string; license_updates_until: string }>
  if (!rows.length) return NextResponse.json({ error: 'Desktop order not found.' }, { status: 404 })
  return NextResponse.json({
    order: rows[0].order_id,
    licenseKey: rows[0].license_key,
    updatesUntil: rows[0].license_updates_until,
    download: DESK_PRODUCT.downloadPath,
  })
}
