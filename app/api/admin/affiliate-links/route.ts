import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { exchanges } from '@/lib/data/exchanges'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_links (
      slug       TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      affiliate_url TEXT NOT NULL,
      general_url   TEXT,
      notes      TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
}

// GET — return all links (DB rows merged with exchanges.ts as seed/fallback)
export async function GET() {
  try {
    await ensureTable()

    // Seed from exchanges.ts if table is empty
    const existing = await sql`SELECT slug FROM affiliate_links LIMIT 1`
    if (existing.length === 0) {
      for (const ex of exchanges) {
        await sql`
          INSERT INTO affiliate_links (slug, name, affiliate_url, general_url)
          VALUES (${ex.slug}, ${ex.name}, ${ex.referralLink}, ${ex.referralLink})
          ON CONFLICT (slug) DO NOTHING
        `
      }
    }

    const rows = await sql`SELECT * FROM affiliate_links ORDER BY name ASC`
    return NextResponse.json(rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — upsert a link
export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTable()
    const { slug, name, affiliate_url, general_url, notes } = await request.json()
    if (!slug || !name || !affiliate_url) {
      return NextResponse.json({ error: 'slug, name and affiliate_url are required' }, { status: 400 })
    }
    const rows = await sql`
      INSERT INTO affiliate_links (slug, name, affiliate_url, general_url, notes, updated_at)
      VALUES (${slug.trim()}, ${name.trim()}, ${affiliate_url.trim()}, ${general_url?.trim() ?? null}, ${notes?.trim() ?? null}, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        name          = EXCLUDED.name,
        affiliate_url = EXCLUDED.affiliate_url,
        general_url   = EXCLUDED.general_url,
        notes         = EXCLUDED.notes,
        updated_at    = NOW()
      RETURNING *
    `
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
