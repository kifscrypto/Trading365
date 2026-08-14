import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'

// 401 when unauthenticated — the admin UI gates on res.ok. The body always
// carries the boolean for callers that parse JSON instead.
export async function GET(request: Request) {
  const authenticated = await verifyAdmin(request)
  return NextResponse.json({ authenticated }, { status: authenticated ? 200 : 401 })
}
