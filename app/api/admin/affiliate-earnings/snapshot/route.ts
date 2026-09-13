import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ensureTables } from '../route'
import { toUsd } from '@/lib/affiliate-sync/to-usd'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

// GET ?account=<slug>&limit=N — snapshot history for one account (newest first).
export async function GET(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTables()
    const url = new URL(request.url)
    const account = url.searchParams.get('account')
    if (!account) return NextResponse.json({ error: 'account is required' }, { status: 400 })
    const limit = Math.min(Number(url.searchParams.get('limit')) || 60, 200)
    const rows = await sql`
      SELECT id, account_slug, commission_usd, captured_at, referrals, period_label, source, notes, raw_json
      FROM affiliate_snapshots
      WHERE account_slug = ${account}
      ORDER BY captured_at DESC
      LIMIT ${limit}
    `
    return NextResponse.json(rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — log an earnings reading for an account.
export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTables()
    const body = await request.json()
    const account_slug = String(body.account_slug || '').trim()
    const amount = Number(body.amount)
    const currency = String(body.currency || 'USDT').trim().toUpperCase()
    if (!account_slug) return NextResponse.json({ error: 'account_slug is required' }, { status: 400 })
    if (!isFinite(amount)) return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })

    const acct = await sql`SELECT slug FROM affiliate_accounts WHERE slug = ${account_slug}`
    if (acct.length === 0) return NextResponse.json({ error: 'Unknown account' }, { status: 404 })

    const { usd, rate, approximated } = await toUsd(amount, currency)
    const referrals = body.referrals != null && body.referrals !== '' ? Number(body.referrals) : null
    const period_label = body.period_label?.trim() || null
    const notes = body.notes?.trim() || null
    const source = ['manual', 'api'].includes(body.source) ? body.source : 'manual'
    const capturedAt = body.captured_at ? new Date(body.captured_at) : null

    const rows = await sql`
      INSERT INTO affiliate_snapshots
        (account_slug, commission_usd, referrals, period_label, source, notes, captured_at, raw_json)
      VALUES (
        ${account_slug}, ${usd}, ${referrals}, ${period_label}, ${source}, ${notes},
        COALESCE(${capturedAt ? capturedAt.toISOString() : null}::timestamp, NOW()),
        ${JSON.stringify({ amount, currency, rate, approximated })}
      )
      RETURNING *
    `
    return NextResponse.json({ snapshot: rows[0], approximated }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?id=N — remove a mistaken snapshot.
export async function DELETE(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await sql`DELETE FROM affiliate_snapshots WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
