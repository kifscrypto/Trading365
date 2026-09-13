import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ensureTables } from '../route'
import { adapters } from '@/lib/affiliate-sync'
import { decryptSecret } from '@/lib/affiliate-sync/crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

// Daily auto-sync: for every account with credentials, sync_enabled, and a
// registered adapter, pull the all-time commission total from the exchange's
// affiliate API and write it as a snapshot with source 'api'. Each exchange is
// isolated — one failure is recorded on its credentials row and in the summary
// without blocking the others. Auth follows the scanner cron pattern
// (?cron=true, or Bearer CRON_SECRET, or an authed admin session).

async function run(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureTables()
    const onlySlug = url.searchParams.get('slug')
    const credRows = onlySlug
      ? await sql`SELECT * FROM affiliate_credentials WHERE slug = ${onlySlug}`
      : await sql`SELECT * FROM affiliate_credentials WHERE sync_enabled = TRUE`

    const synced: { slug: string; total_usd: number; referrals: number | null }[] = []
    const failed: { slug: string; error: string }[] = []
    const skipped: string[] = []

    for (const row of credRows) {
      const adapter = adapters[row.slug]
      if (!adapter || !row.sync_enabled) {
        skipped.push(row.slug)
        continue
      }
      try {
        const result = await adapter({
          apiKey: decryptSecret(row.api_key_enc),
          apiSecret: row.api_secret_enc ? decryptSecret(row.api_secret_enc) : undefined,
          passphrase: row.passphrase_enc ? decryptSecret(row.passphrase_enc) : undefined,
        })
        await sql`
          INSERT INTO affiliate_snapshots
            (account_slug, commission_usd, referrals, period_label, source, raw_json)
          VALUES (
            ${row.slug}, ${result.totalUsd}, ${result.referrals ?? null},
            'all-time (api)', 'api',
            ${JSON.stringify({ breakdown: result.breakdown, raw: result.raw })}
          )
        `
        await sql`
          UPDATE affiliate_credentials
          SET last_sync_at = NOW(), last_sync_status = 'ok', last_sync_error = NULL
          WHERE slug = ${row.slug}
        `
        synced.push({ slug: row.slug, total_usd: result.totalUsd, referrals: result.referrals ?? null })
      } catch (err: any) {
        const message = err?.message ?? String(err)
        await sql`
          UPDATE affiliate_credentials
          SET last_sync_at = NOW(), last_sync_status = 'error', last_sync_error = ${message}
          WHERE slug = ${row.slug}
        `
        failed.push({ slug: row.slug, error: message })
      }
    }

    return NextResponse.json({ synced, failed, skipped })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return run(request)
}

// Vercel crons call GET.
export async function GET(request: Request) {
  return run(request)
}
