import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS custom_categories (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      long_description TEXT NOT NULL DEFAULT '',
      nav_label TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTable()
  const rows = await sql`SELECT * FROM custom_categories ORDER BY created_at ASC`
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTable()

  const { slug, title, description, long_description, nav_label } = await request.json()
  if (!slug || !title) return NextResponse.json({ error: 'slug and title are required' }, { status: 400 })

  const rows = await sql`
    INSERT INTO custom_categories (slug, title, description, long_description, nav_label)
    VALUES (${slug}, ${title}, ${description ?? ''}, ${long_description ?? ''}, ${nav_label || title})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      long_description = EXCLUDED.long_description,
      nav_label = EXCLUDED.nav_label,
      updated_at = NOW()
    RETURNING *
  `
  return NextResponse.json(rows[0])
}
