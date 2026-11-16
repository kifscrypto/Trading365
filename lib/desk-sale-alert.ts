import { post } from './discord'
import { emailConfigured, esc, renderEmail, sendEmail } from './email'

// Who gets the "you made a sale" alert. Override with SALES_ALERT_EMAIL.
const SALES_EMAIL = process.env.SALES_ALERT_EMAIL || process.env.ADMIN_EMAIL || 'kifscrypto@gmail.com'

/**
 * Tell the owner a T365 Terminal licence was actually bought. Fired from the
 * payment webhook AFTER the order is marked paid. Never throws: a failed alert
 * must not make NOWPayments retry a purchase that already succeeded.
 */
export async function notifyDeskSale(input: {
  orderId: string
  email?: string | null
  amountUsd: number
  updatesUntil: string
}): Promise<void> {
  const amount = `$${input.amountUsd}`
  const buyer = input.email || 'unknown buyer'

  try {
    await post([
      {
        title: '💰 T365 Terminal sold',
        description: `${amount} — ${buyer}`,
        color: 0x2e9e4f,
        fields: [
          { name: 'Order', value: input.orderId, inline: false },
          { name: 'Buyer', value: buyer, inline: true },
          { name: 'Support until', value: input.updatesUntil.slice(0, 10), inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ])
  } catch (error) {
    console.error('[desk-sale] discord alert failed:', error)
  }

  if (!emailConfigured()) return
  try {
    await sendEmail({
      to: SALES_EMAIL,
      subject: `T365 Terminal sale: ${amount} — ${buyer}`,
      html: renderEmail({
        heading: 'T365 Terminal sale',
        paragraphs: [
          `A T365 Terminal licence was purchased for <strong>${esc(amount)}</strong>.`,
          `Buyer: <strong>${esc(buyer)}</strong>`,
          `Order: <strong>${esc(input.orderId)}</strong>`,
          `Support until: <strong>${esc(input.updatesUntil.slice(0, 10))}</strong>`,
        ],
        cta: { text: 'Open admin orders', url: 'https://trading365.org/admin/members' },
      }),
    })
  } catch (error) {
    console.error('[desk-sale] email alert failed:', error)
  }
}
