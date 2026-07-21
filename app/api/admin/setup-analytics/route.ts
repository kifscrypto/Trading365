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
    await sql`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        path TEXT NOT NULL,
        referrer TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        country TEXT,
        device TEXT,
        user_agent TEXT,
        visitor_id TEXT,
        is_bot BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    // Migrations for pre-existing tables (unique visitors + bot classification)
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS user_agent TEXT`
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS visitor_id TEXT`
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE`
    // Engagement / behavior columns: session grouping + dwell time + scroll depth.
    // session_id groups hits into visits (30-min inactivity window, minted client-side);
    // duration_ms + max_scroll_pct are backfilled by the /api/track/engage beacon on leave.
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS session_id TEXT`
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS duration_ms INTEGER`
    await sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS max_scroll_pct SMALLINT`
    await sql`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views (path)`
    await sql`CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON page_views (visitor_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_page_views_is_bot ON page_views (is_bot)`
    await sql`CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views (session_id)`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
