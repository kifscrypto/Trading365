import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { getMemberSummary, listMembers } from '@/lib/users'
import { listOrders } from '@/lib/premium'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin read-only view of the member base — the thing that did not exist.
//
// Before this route, the only admin affordance over accounts was
// /api/admin/entitlements, which looks up ONE email at a time and POSTs grants.
// Nothing anywhere could answer "who has signed up?" or "did anyone buy?", so
// both required hand-written SQL. This returns the whole picture in one call:
// summary counts, the member list, and the order list.
//
//   GET /api/admin/members
//   GET /api/admin/members?search=someone@example.com
//   GET /api/admin/members?includePending=true   (reveals the crawl junk)
//
// Grants and revocations deliberately do NOT live here: /api/admin/entitlements
// already implements them against the same grantEntitlement/revokeEntitlement
// the payment webhook uses. Duplicating that logic would create a second path to
// grant access, and the two would drift.
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const search = params.get('search') ?? ''
  const includePending = params.get('includePending') === 'true'
  const limit = Math.min(Math.max(Number(params.get('limit') ?? 200) || 200, 1), 1000)

  // The two lists are independent, so they run together rather than in sequence.
  const [summary, members, orders] = await Promise.all([
    getMemberSummary(),
    listMembers(limit, search),
    listOrders({ limit, includePending }),
  ])

  return NextResponse.json({ ok: true, summary, members, orders })
}