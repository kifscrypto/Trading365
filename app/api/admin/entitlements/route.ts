import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { findUserByEmail, getAccount, grantEntitlement, normaliseEmail, revokeEntitlement } from '@/lib/users'
import { accessGrantedEmail, emailConfigured, sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin grant/revoke for site access. Needed for comps, support fixes ("I paid
// but used a different email") and for exercising the paid tier without taking a
// real payment — the same code path the payment webhook uses.
//
//   GET  /api/admin/entitlements?email=someone@example.com
//   POST /api/admin/entitlements  { email, days?: 14|null, source?: 'manual' }
//   POST /api/admin/entitlements  { email, days, notify: false }   ← silent comp
//   POST /api/admin/entitlements  { revoke: true, source: 'nowpayments', externalId: 't365-...' }
//
// `days` omitted now means 14, not 30. 14 is the ordinary comp and 30 is kept for
// occasions that warrant a month, so an omitted parameter should land on the
// everyday value rather than the special one — forgetting the argument should not
// quietly double the grant. The UI always sends an explicit value; this default
// only decides what a bare curl does.
//
// A grant now EMAILS the member. Before that, granting 30 days changed the
// database and told nobody: the recipient had no way to learn they had been given
// access except by signing in and noticing the badge. Pass notify: false to
// suppress it — worth doing for a test grant to your own address.

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

    const days = body?.days === null ? null : Number(body?.days ?? 14)
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      return NextResponse.json({ error: 'days must be a positive number, or null for lifetime' }, { status: 400 })
    }

    const source = String(body?.source ?? 'manual')
    await grantEntitlement(user.id, { source, days })
    const account = await getAccount(user.id)

    // Tell the member. Default ON, because a grant nobody knows about is barely a
    // grant — the whole reason /admin/members could hand out access invisibly was
    // that this step did not exist. `notify: false` opts out for a test grant.
    //
    // Named emailStatus, NOT email: `email` above is the recipient's address, and
    // shadowing it here would have sent the grant notice to the literal string
    // "not-sent".
    let emailStatus = 'not-sent'
    if (body?.notify !== false && emailConfigured()) {
      const sent = await sendEmail(accessGrantedEmail({ email, days, source }))
      emailStatus = sent.status
      // Surfaced in the response rather than only logged: an admin comping a
      // customer needs to know whether the customer was actually told.
      if (!sent.ok) console.error(`[admin/entitlements] grant email failed (${sent.status}) for ${email}`)
    }

    return NextResponse.json({ ok: true, account, email: emailStatus })
  } catch (err) {
    console.error('[admin/entitlements]', err)
    return NextResponse.json({ error: 'Grant failed' }, { status: 500 })
  }
}