import { NextResponse } from 'next/server'
import { isOpsAuthorized } from '@/lib/ops-auth'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/ops/game-stats — proxy for the Meme Asylum game-stats endpoint
// (pass stock, pending wins, engagement). Keys stay server-side; the SPA
// calls this route with the admin session cookie.
export async function GET(request: Request) {
  if (!(await isOpsAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const base = process.env.MEME_ASYLUM_STATS_URL
  const token = process.env.MEME_ASYLUM_STATS_TOKEN
  if (!base || !token) {
    return NextResponse.json(
      { error: 'MEME_ASYLUM_STATS_URL / MEME_ASYLUM_STATS_TOKEN not configured' },
      { status: 503, headers: NO_STORE },
    )
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/games/stats`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream HTTP ${res.status}` },
        { status: 502, headers: NO_STORE },
      )
    }
    const data: unknown = await res.json()
    return NextResponse.json(data, { headers: NO_STORE })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'upstream fetch failed'
    return NextResponse.json({ error: message }, { status: 502, headers: NO_STORE })
  }
}
