import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { name, image_url, destination_url, active, display_order } = await request.json()
  const rows = await sql`
    UPDATE promotions SET
      name            = COALESCE(${name ?? null}, name),
      image_url       = COALESCE(${image_url ?? null}, image_url),
      destination_url = COALESCE(${destination_url ?? null}, destination_url),
      active          = COALESCE(${active ?? null}, active),
      display_order   = COALESCE(${display_order ?? null}, display_order),
      updated_at      = NOW()
    WHERE id = ${parseInt(id)}
    RETURNING *
  `
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await sql`DELETE FROM promotions WHERE id = ${parseInt(id)}`
  return NextResponse.json({ ok: true })
}
