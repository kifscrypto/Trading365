import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { ensureTables } from '../route'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

const STABLES = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE'])
// Symbol → CoinGecko id for the handful of coins a commission might be paid in.
const CG_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', TRX: 'tron', TON: 'the-open-network', DOGE: 'dogecoin',
}

// Normalize an amount in `currency` to USD. Stablecoins are 1:1; known coins are
// priced via CoinGecko; anything unknown falls back to 1:1 and is flagged so the
// admin can correct it rather than silently mis-recording the figure.
async function toUsd(amount: number, currency: string): Promise<{ usd: number; rate: number; approximated: boolean }> {
  const cur = currency.toUpperCase()
  if (STABLES.has(cur)) return { usd: amount, rate: 1, approximated: false }
  const id = CG_IDS[cur]
  if (!id) return { usd: amount, rate: 1, approximated: true }
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { usd: amount, rate: 1, approximated: true }
    const data = await res.json()
    const rate = Number(data?.[id]?.usd)
    if (!rate || !isFinite(rate)) return { usd: amount, rate: 1, approximated: true }
    return { usd: +(amount * rate).toFixed(2), rate, approximated: false }
  } catch {
    return { usd: amount, rate: 1, approximated: true }
  }
}

// GET ?account=<slug>&limit=N — snapshot history for one account (newest first).
export async function GET(request: Request) {
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
  if (!(await checkAuth())) {
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
    const capturedAt = body.captured_at ? new Date(body.captured_at) : null

    const rows = await sql`
      INSERT INTO affiliate_snapshots
        (account_slug, commission_usd, referrals, period_label, source, notes, captured_at, raw_json)
      VALUES (
        ${account_slug}, ${usd}, ${referrals}, ${period_label}, 'manual', ${notes},
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
  if (!(await checkAuth())) {
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
