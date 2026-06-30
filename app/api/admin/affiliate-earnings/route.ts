import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { exchanges } from '@/lib/data/exchanges'

// Affiliate EARNINGS tracker (distinct from /admin/affiliate-links, which manages
// outbound referral URLs). v1 is manual entry: you read the commission balance off
// each exchange's affiliate dashboard and log it here, building a per-exchange
// time series. No credentials are stored — that only arrives if/when we add
// automated scrapers for the highest-value exchanges.

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_accounts (
      slug          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      dashboard_url TEXT,
      notes         TEXT,
      enabled       BOOLEAN DEFAULT TRUE,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_snapshots (
      id             SERIAL PRIMARY KEY,
      account_slug   TEXT NOT NULL REFERENCES affiliate_accounts(slug) ON DELETE CASCADE,
      captured_at    TIMESTAMP DEFAULT NOW(),
      commission_usd NUMERIC(14,2) NOT NULL,
      referrals      INTEGER,
      period_label   TEXT,
      source         TEXT DEFAULT 'manual',
      notes          TEXT,
      raw_json       JSONB
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_affsnap_account_time
      ON affiliate_snapshots (account_slug, captured_at DESC)
  `
}

// GET — accounts with their latest + previous snapshot and a grand total.
export async function GET() {
  try {
    await ensureTables()

    // Seed the account list from the known partner exchanges on first run, so the
    // dashboard isn't empty. These start with no earnings logged.
    const existing = await sql`SELECT slug FROM affiliate_accounts LIMIT 1`
    if (existing.length === 0) {
      for (const ex of exchanges) {
        await sql`
          INSERT INTO affiliate_accounts (slug, name, dashboard_url)
          VALUES (${ex.slug}, ${ex.name}, ${ex.referralLink ?? null})
          ON CONFLICT (slug) DO NOTHING
        `
      }
    }

    const accounts = await sql`SELECT * FROM affiliate_accounts ORDER BY name ASC`

    // Two most recent snapshots per account (latest = current reading,
    // previous = basis for the delta/trend badge).
    const recent = await sql`
      SELECT account_slug, commission_usd, captured_at, referrals, period_label, rn
      FROM (
        SELECT account_slug, commission_usd, captured_at, referrals, period_label,
               ROW_NUMBER() OVER (PARTITION BY account_slug ORDER BY captured_at DESC) AS rn
        FROM affiliate_snapshots
      ) s
      WHERE rn <= 2
    `

    const latestBySlug = new Map<string, any>()
    const prevBySlug = new Map<string, any>()
    for (const r of recent) {
      if (Number(r.rn) === 1) latestBySlug.set(r.account_slug, r)
      else if (Number(r.rn) === 2) prevBySlug.set(r.account_slug, r)
    }

    const rows = accounts.map((a: any) => {
      const latest = latestBySlug.get(a.slug) ?? null
      const prev = prevBySlug.get(a.slug) ?? null
      const current = latest ? Number(latest.commission_usd) : null
      const before = prev ? Number(prev.commission_usd) : null
      return {
        ...a,
        current_usd: current,
        delta_usd: current != null && before != null ? +(current - before).toFixed(2) : null,
        last_logged_at: latest?.captured_at ?? null,
        referrals: latest?.referrals ?? null,
        period_label: latest?.period_label ?? null,
      }
    })

    const total_usd = +rows
      .filter((r: any) => r.enabled && r.current_usd != null)
      .reduce((sum: number, r: any) => sum + r.current_usd, 0)
      .toFixed(2)

    return NextResponse.json({ accounts: rows, total_usd })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — create / upsert an account.
export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTables()
    const { slug, name, dashboard_url, notes, enabled } = await request.json()
    if (!slug || !name) {
      return NextResponse.json({ error: 'slug and name are required' }, { status: 400 })
    }
    const rows = await sql`
      INSERT INTO affiliate_accounts (slug, name, dashboard_url, notes, enabled, updated_at)
      VALUES (
        ${String(slug).trim()}, ${String(name).trim()},
        ${dashboard_url?.trim() || null}, ${notes?.trim() || null},
        ${enabled ?? true}, NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name          = EXCLUDED.name,
        dashboard_url = EXCLUDED.dashboard_url,
        notes         = EXCLUDED.notes,
        enabled       = EXCLUDED.enabled,
        updated_at    = NOW()
      RETURNING *
    `
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
