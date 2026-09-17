import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { findUserByEmail, getAccount, grantEntitlement, normaliseEmail, revokeEntitlement } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin grant/revoke for site access. Needed for comps, support fixes ("I paid
// but used a different email") and for exercising the paid tier without taking a
// real payment — the same code path the payment webhook uses.
//
//   GET  /api/admin/entitlements?email=someone@example.com
//   POST /api/admin/entitlements  { email, days?: 30|null, source?: 'manual' }
//   POST /api/admin/entitlements  { revoke: true, source: 'nowpayments', externalId: 't365-...' }

async function requireAdmin(request: Request) {
  return verifyAdmin(request)
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = normaliseEmail(new URL(request.url).searchParams.get('email') ?? '')
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const user = await findUserByEmail(email)
  if (!user) return NextResponse.json({ error: 'No account with that email' }, { status: 404 })
  const account = await getAccount(user.id)
  return NextResponse.json({ ok: true, account })
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    if (body?.revoke) {
      const source = String(body.source ?? '')
      const externalId = String(body.externalId ?? '')
      if (!source || !externalId) {
        return NextResponse.json({ error: 'source and externalId are required to revoke' }, { status: 400 })
      }
      await revokeEntitlement(source, externalId)
      return NextResponse.json({ ok: true, revoked: { source, externalId } })
    }

    const email = normaliseEmail(String(body?.email ?? ''))
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

    const user = await findUserByEmail(email)
    if (!user) {
      // Deliberately explicit: an admin is usually fixing a customer's problem,
      // and "no account" is the answer they need.
      return NextResponse.json({ error: 'No account with that email — they need to sign up first.' }, { status: 404 })
    }

    const days = body?.days === null ? null : Number(body?.days ?? 30)
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      return NextResponse.json({ error: 'days must be a positive number, or null for lifetime' }, { status: 400 })
    }

    await grantEntitlement(user.id, { source: String(body?.source ?? 'manual'), days })
    const account = await getAccount(user.id)
    return NextResponse.json({ ok: true, account })
  } catch (err) {
    console.error('[admin/entitlements]', err)
    return NextResponse.json({ error: 'Grant failed' }, { status: 500 })
  }
}