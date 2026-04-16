import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const { title, description, long_description, nav_label } = await request.json()

  const rows = await sql`
    UPDATE custom_categories SET
      title = COALESCE(${title ?? null}, title),
      description = COALESCE(${description ?? null}, description),
      long_description = COALESCE(${long_description ?? null}, long_description),
      nav_label = COALESCE(${nav_label ?? null}, nav_label),
      updated_at = NOW()
    WHERE slug = ${slug}
    RETURNING *
  `
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  await sql`DELETE FROM custom_categories WHERE slug = ${slug}`
  return NextResponse.json({ ok: true })
}
