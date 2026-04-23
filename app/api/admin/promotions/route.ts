import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { ensurePromotionsTable } from '@/lib/data/promotions'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensurePromotionsTable()
  const rows = await sql`SELECT * FROM promotions ORDER BY display_order ASC, created_at DESC`
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensurePromotionsTable()
  const { name, image_url, destination_url, active, display_order } = await request.json()
  if (!name || !image_url || !destination_url) {
    return NextResponse.json({ error: 'name, image_url, and destination_url are required' }, { status: 400 })
  }
  const rows = await sql`
    INSERT INTO promotions (name, image_url, destination_url, active, display_order)
    VALUES (${name.trim()}, ${image_url.trim()}, ${destination_url.trim()}, ${active ?? true}, ${display_order ?? 0})
    RETURNING *
  `
  return NextResponse.json(rows[0], { status: 201 })
}
