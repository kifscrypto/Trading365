import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function POST() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_title TEXT`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_description TEXT`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_keywords TEXT`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
