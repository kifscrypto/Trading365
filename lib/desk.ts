import crypto from 'node:crypto'
import { setupSubscribersTable, sql } from './premium'

export const DESK_PRODUCT = {
  key: 'desktop-v1',
  product: 't365-desk',
  label: 'T365 Terminal',
  amount: 299,
  majorVersion: 1,
  updateDays: 365,
  version: '1.2.2',
  downloadPath: '/api/desk/download',
} as const

// GitHub resolves /releases/latest/download/<asset> to the newest non-prerelease
// release, so this stable URL never has to change between versions. Each release
// uploads a copy of the installer under this fixed asset name (see
// scripts/upload-desk-release.mjs). The download route ignores any env override.
export const DESK_INSTALLER_URL =
  'https://github.com/kifscrypto/Trading365/releases/latest/download/T365-Terminal-Setup.exe'

export function deskEnabled(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY && !!process.env.DESKTOP_LICENSE_PRIVATE_KEY
}

export function newDeskOrderId(): string {
  return `t365-desk-v1-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

export async function createDeskInvoice(orderId: string, site: string): Promise<string> {
  const response = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: DESK_PRODUCT.amount,
      price_currency: 'usd',
      order_id: orderId,
      order_description: 'T365 Terminal — perpetual licence with all future versions and 365 days of support',
      ipn_callback_url: `${site}/api/pay/webhook`,
      success_url: `${site}/account?checkout=desk-success`,
      cancel_url: `${site}/account?checkout=cancelled`,
    }),
  })
  const json = await response.json()
  if (!response.ok || !json.invoice_url) throw new Error(`NOWPayments desktop invoice failed: ${JSON.stringify(json)}`)
  return json.invoice_url as string
}

export interface DeskPurchase {
  order_id: string
  license_key: string
  license_updates_until: string
  paid_at: string
}

export async function getDeskPurchases(userId: number): Promise<DeskPurchase[]> {
  try {
    await setupSubscribersTable()
    return await sql`
      SELECT order_id, license_key, license_updates_until, paid_at
      FROM subscribers
      WHERE user_id = ${userId} AND product = ${DESK_PRODUCT.product}
        AND status IN ('paid', 'active') AND license_key IS NOT NULL
      ORDER BY paid_at DESC NULLS LAST
    ` as unknown as DeskPurchase[]
  } catch (error) {
    console.error('[desk] getDeskPurchases failed:', error)
    return []
  }
}
