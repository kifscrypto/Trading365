import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { isOpsAuthorized } from '@/lib/ops-auth'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const FIXED_COLLECTIONS = new Set([
  'content',
  'tasks',
  'inbox',
  'outreach',
  'templates',
  'cycles',
  'quora_queue',
])
const DATED_NAME = /^(briefing|traffic|health)-\d{4}-\d{2}-\d{2}$/

function isValidName(name: string): boolean {
  return FIXED_COLLECTIONS.has(name) || DATED_NAME.test(name)
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS ops_collections (
      name       TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `
}

// GET /api/ops/<name> — the stored JSON (array for the fixed collections,
// data object for dated briefing-/traffic-/health- names), 404 if never written.
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isOpsAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const { name } = await params
  if (!isValidName(name)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400, headers: NO_STORE })
  }
  try {
    await ensureTable()
    const rows = await sql`SELECT data FROM ops_collections WHERE name = ${name}`
    if (!rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    }
    return NextResponse.json(rows[0].data, { headers: NO_STORE })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })
  }
}

// PUT /api/ops/<name> — replace the collection. Fixed collections must be
// JSON arrays (matches serve.py); dated briefing-/traffic-/health- names
// store their data object as-is.
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isOpsAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const { name } = await params
  if (!isValidName(name)) {
    return NextResponse.json({ error: 'Invalid collection name' }, { status: 400, headers: NO_STORE })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }
  if (FIXED_COLLECTIONS.has(name) && !Array.isArray(body)) {
    return NextResponse.json({ error: 'body must be a JSON array' }, { status: 400, headers: NO_STORE })
  }
  try {
    await ensureTable()
    await sql`
      INSERT INTO ops_collections (name, data, updated_at)
      VALUES (${name}, ${JSON.stringify(body)}::jsonb, NOW())
      ON CONFLICT (name) DO UPDATE SET
        data       = EXCLUDED.data,
        updated_at = NOW()
    `
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })
  }
}
