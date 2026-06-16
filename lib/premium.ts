import { neon } from '@neondatabase/serverless'
import crypto from 'node:crypto'

// ── Shared config ───────────────────────────────────────────────────────────
export const SITE = 'https://trading365.org'

export const PLANS = {
  monthly:   { key: 'monthly',   label: 'Monthly',   amount: 29, days: 30 },
  quarterly: { key: 'quarterly', label: 'Quarterly', amount: 69, days: 90 },
} as const
export type PlanKey = keyof typeof PLANS
export const isPlanKey = (v: string): v is PlanKey => v === 'monthly' || v === 'quarterly'

/** Premium-payments are only wired on when both NOWPayments + the premium channel are configured. */
export function premiumEnabled(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY && !!process.env.TELEGRAM_PREMIUM_CHAT_ID
}

export const sql = neon(process.env.DATABASE_URL!)

// ── Schema ──────────────────────────────────────────────────────────────────
let tableReady = false
export async function setupSubscribersTable(): Promise<void> {
  if (tableReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS subscribers (
      id          BIGSERIAL PRIMARY KEY,
      order_id    TEXT UNIQUE NOT NULL,
      plan        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending', -- pending | paid | active | expired | removed
      payment_id  TEXT,
      amount_usd  NUMERIC,
      invite_link TEXT,
      tg_user_id  BIGINT,
      tg_username TEXT,
      paid_at     TIMESTAMPTZ,
      expires_at  TIMESTAMPTZ,
      removed_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  tableReady = true
}

export function newOrderId(plan: PlanKey): string {
  return `t365-${plan}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

// ── NOWPayments ─────────────────────────────────────────────────────────────
/** Create a hosted invoice; returns the checkout URL the buyer is redirected to. */
export async function createInvoice(orderId: string, plan: PlanKey): Promise<string> {
  const p = PLANS[plan]
  const res = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount:      p.amount,
      price_currency:    'usd',
      order_id:          orderId,
      order_description: `Trading365 Scanner Premium — ${p.label} (${p.days} days)`,
      ipn_callback_url:  `${SITE}/api/pay/webhook`,
      success_url:       `${SITE}/premium/success?order=${orderId}`,
      cancel_url:        `${SITE}/scanner?checkout=cancelled`,
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.invoice_url) {
    throw new Error(`NOWPayments invoice failed: ${JSON.stringify(json)}`)
  }
  return json.invoice_url as string
}

/** Recursively sort object keys, then HMAC-SHA512 with the IPN secret (NOWPayments spec). */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (obj && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).sort().reduce((acc, k) => {
      acc[k] = sortKeys((obj as Record<string, unknown>)[k])
      return acc
    }, {} as Record<string, unknown>)
  }
  return obj
}

export function verifyIpnSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET
  if (!secret || !signature) return false
  let parsed: unknown
  try { parsed = JSON.parse(rawBody) } catch { return false }
  const sorted = JSON.stringify(sortKeys(parsed))
  const hmac = crypto.createHmac('sha512', secret).update(sorted).digest('hex')
  // timing-safe compare (lengths must match first)
  if (hmac.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
}

/** NOWPayments statuses that mean the money has actually landed. */
export const PAID_STATUSES = new Set(['confirmed', 'finished'])

// ── Telegram ────────────────────────────────────────────────────────────────
async function tg(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (!json.ok) console.error(`[tg:${method}] error`, JSON.stringify(json))
  return json
}

/** A single-buyer join-request link into the premium channel, tagged with the order id. */
export async function createPremiumInvite(orderId: string): Promise<string | null> {
  const chatId = process.env.TELEGRAM_PREMIUM_CHAT_ID!
  const json = await tg('createChatInviteLink', {
    chat_id: chatId,
    name: orderId.slice(0, 32),        // shows in chat_join_request.invite_link.name
    creates_join_request: true,
  })
  const result = json.result as { invite_link?: string } | undefined
  return result?.invite_link ?? null
}

export async function approveJoinRequest(userId: number): Promise<void> {
  await tg('approveChatJoinRequest', { chat_id: process.env.TELEGRAM_PREMIUM_CHAT_ID!, user_id: userId })
}
export async function declineJoinRequest(userId: number): Promise<void> {
  await tg('declineChatJoinRequest', { chat_id: process.env.TELEGRAM_PREMIUM_CHAT_ID!, user_id: userId })
}

/** Remove a member; immediately unban so a future re-purchase can rejoin. */
export async function removeMember(userId: number): Promise<void> {
  const chatId = process.env.TELEGRAM_PREMIUM_CHAT_ID!
  await tg('banChatMember', { chat_id: chatId, user_id: userId })
  await tg('unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true })
}
