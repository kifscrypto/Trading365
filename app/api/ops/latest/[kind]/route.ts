import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { isOpsAuthorized } from '@/lib/ops-auth'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/ops/latest/<kind> — newest briefing-* or traffic-* entry's data
// object (names sort chronologically), 404 when none exists yet.
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await isOpsAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const { kind } = await params
  if (kind !== 'briefing' && kind !== 'traffic') {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS ops_collections (
        name       TEXT PRIMARY KEY,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `
    const rows = await sql`
      SELECT data FROM ops_collections
      WHERE name LIKE ${kind + '-%'}
      ORDER BY name DESC
      LIMIT 1
    `
    if (!rows[0]) {
      return NextResponse.json({ error: `no ${kind} yet` }, { status: 404, headers: NO_STORE })
    }
    return NextResponse.json(rows[0].data, { headers: NO_STORE })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })
  }
}
