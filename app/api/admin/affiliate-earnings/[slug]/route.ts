import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

// PUT — edit an account (name / dashboard_url / notes / enabled).
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { slug } = await params
    const { name, dashboard_url, notes, enabled } = await request.json()
    const rows = await sql`
      UPDATE affiliate_accounts SET
        name          = COALESCE(${name?.trim() || null}, name),
        dashboard_url = ${dashboard_url?.trim() || null},
        notes         = ${notes?.trim() || null},
        enabled       = COALESCE(${enabled ?? null}, enabled),
        updated_at    = NOW()
      WHERE slug = ${slug}
      RETURNING *
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE — remove an account and its snapshots (FK cascade).
export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { slug } = await params
    await sql`DELETE FROM affiliate_accounts WHERE slug = ${slug}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
