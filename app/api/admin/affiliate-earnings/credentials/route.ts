import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { ensureTables } from '../route'
import { encryptSecret } from '@/lib/affiliate-sync/crypto'

export const runtime = 'nodejs'

// Per-exchange API credentials for the daily auto-sync. Secrets are stored
// AES-256-GCM encrypted and are write-only — GET never returns them.

// GET — per-slug sync status for the admin UI.
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTables()
    const rows = await sql`
      SELECT slug, sync_enabled, last_sync_at, last_sync_status, last_sync_error,
             (passphrase_enc IS NOT NULL) AS has_passphrase
      FROM affiliate_credentials
    `
    const credentials: Record<string, any> = {}
    for (const r of rows) {
      credentials[r.slug] = {
        configured: true,
        sync_enabled: r.sync_enabled,
        last_sync_at: r.last_sync_at,
        last_sync_status: r.last_sync_status,
        last_sync_error: r.last_sync_error,
        has_passphrase: r.has_passphrase,
      }
    }
    return NextResponse.json({ credentials })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT { slug, api_key, api_secret?, passphrase?, sync_enabled? } — encrypt and
// upsert. Empty secret fields keep the existing stored value, so you can
// rotate just one field.
export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTables()
    const { slug, api_key, api_secret, passphrase, sync_enabled } = await request.json()
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

    const apiKey = api_key?.trim() ? encryptSecret(api_key.trim()) : null
    if (!apiKey) {
      const existing = await sql`SELECT slug FROM affiliate_credentials WHERE slug = ${slug}`
      if (existing.length === 0) {
        return NextResponse.json({ error: 'api_key is required for new credentials' }, { status: 400 })
      }
    }

    await sql`
      INSERT INTO affiliate_credentials (slug, api_key_enc, api_secret_enc, passphrase_enc, sync_enabled, updated_at)
      VALUES (
        ${slug}, ${apiKey},
        ${api_secret?.trim() ? encryptSecret(api_secret.trim()) : null},
        ${passphrase?.trim() ? encryptSecret(passphrase.trim()) : null},
        ${sync_enabled ?? true}, NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        api_key_enc    = COALESCE(EXCLUDED.api_key_enc, affiliate_credentials.api_key_enc),
        api_secret_enc = COALESCE(EXCLUDED.api_secret_enc, affiliate_credentials.api_secret_enc),
        passphrase_enc = COALESCE(EXCLUDED.passphrase_enc, affiliate_credentials.passphrase_enc),
        sync_enabled   = COALESCE(EXCLUDED.sync_enabled, affiliate_credentials.sync_enabled),
        updated_at     = NOW()
    `
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE ?slug= — remove an exchange's stored credentials.
export async function DELETE(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const slug = new URL(request.url).searchParams.get('slug')
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    await sql`DELETE FROM affiliate_credentials WHERE slug = ${slug}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
