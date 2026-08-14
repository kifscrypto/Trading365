import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_title TEXT`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_description TEXT`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_keywords TEXT`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS pros JSONB DEFAULT '[]'::jsonb`
    await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS cons JSONB DEFAULT '[]'::jsonb`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
