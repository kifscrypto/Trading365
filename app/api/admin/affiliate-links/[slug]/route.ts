import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { slug } = await params
    const { name, affiliate_url, general_url, notes } = await request.json()
    const rows = await sql`
      UPDATE affiliate_links SET
        name          = COALESCE(${name ?? null}, name),
        affiliate_url = COALESCE(${affiliate_url ?? null}, affiliate_url),
        general_url   = ${general_url ?? null},
        notes         = ${notes ?? null},
        updated_at    = NOW()
      WHERE slug = ${slug}
      RETURNING *
    `
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { slug } = await params
    await sql`DELETE FROM affiliate_links WHERE slug = ${slug}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
