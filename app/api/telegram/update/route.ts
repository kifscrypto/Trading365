import { NextResponse } from 'next/server'
import { approveJoinRequest, declineJoinRequest, setupSubscribersTable, sql } from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Telegram webhook (set via setWebhook with a secret_token). Handles join
// requests on the premium channel: matches the invite-link name to a paid
// order, records the user id (so expiry can remove them), and auto-approves.
export async function POST(request: Request) {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let update: Record<string, unknown>
  try { update = await request.json() } catch { return NextResponse.json({ ok: true }) }

  const jr = update.chat_join_request as
    | { from?: { id: number; username?: string }; invite_link?: { name?: string } }
    | undefined
  if (!jr?.from?.id) return NextResponse.json({ ok: true })

  const userId   = jr.from.id
  const username = jr.from.username ?? null
  const orderId  = jr.invite_link?.name ?? ''

  try {
    await setupSubscribersTable()
    const rows = orderId
      ? await sql`
          SELECT status, expires_at FROM subscribers
          WHERE order_id = ${orderId} AND status IN ('paid', 'active')
          LIMIT 1` as Array<{ status: string; expires_at: string | null }>
      : []

    const valid = rows.length && (!rows[0].expires_at || new Date(rows[0].expires_at).getTime() > Date.now())
    if (!valid) {
      await declineJoinRequest(userId)
      return NextResponse.json({ ok: true, declined: true })
    }

    await sql`
      UPDATE subscribers
      SET status = 'active', tg_user_id = ${userId}, tg_username = ${username}
      WHERE order_id = ${orderId}
    `
    await approveJoinRequest(userId)
    return NextResponse.json({ ok: true, approved: true })
  } catch (err) {
    console.error('[telegram/update]', err)
    return NextResponse.json({ ok: true }) // never make Telegram retry-storm us
  }
}
