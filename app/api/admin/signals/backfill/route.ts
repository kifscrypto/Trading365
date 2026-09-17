import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { neon } from '@neondatabase/serverless'
import {
  SIDES,
  previewReceipts,
  syncReceipts,
  type ReceiptRow,
  type SignalSide,
  type SyncOptions,
} from '@/lib/signals/public'

// One-time (and safely re-runnable) backfill for signal_receipts — the public
// record behind /signals/[public_id].
//
// DRY BY DEFAULT. Nothing is written unless apply=true is passed explicitly:
//   /api/admin/signals/backfill                 → preview both books, newest rows
//   /api/admin/signals/backfill?side=short      → preview shorts only
//   /api/admin/signals/backfill?apply=true      → WRITE (batched, resumable)
//   /api/admin/signals/backfill?apply=true&after=900&limit=500
//
// The preview and the write share one SQL path (lib/signals/public.ts), so the
// preview is exactly what the write will produce. Idempotent: re-running
// inserts nothing new and only refreshes outcomes.
export const maxDuration = 300

const MAX_LIMIT = 5000

function parseSide(raw: string | null): SignalSide[] {
  if (raw === 'short' || raw === 'long') return [raw]
  return SIDES
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // `apply=true` is the ONLY way to write; everything else is read-only.
  const apply = url.searchParams.get('apply') === 'true'
  const limit = Math.min(Number(url.searchParams.get('limit')) || 500, MAX_LIMIT)
  const afterParam = url.searchParams.get('after')
  const afterId = afterParam ? Number(afterParam) : 0
  const sides = parseSide(url.searchParams.get('side'))

  const sql = neon(process.env.DATABASE_URL!)

  try {
    const reports = []

    for (const side of sides) {
      const opts: SyncOptions = { afterId, limit, origin: 'backfill' }

      if (apply) {
        const written = await syncReceipts(side, opts)
        reports.push({
          side,
          written: written.length,
          nextCursor: written.length === limit ? afterId + limit : null,
          samples: written.slice(0, 3),
        })
        continue
      }

      // ── Dry run ────────────────────────────────────────────────────────────
      const rows: ReceiptRow[] = await previewReceipts(side, { afterId, limit })

      const counts: Record<string, number> = {}
      const seen = new Map<string, number>()
      for (const r of rows) {
        counts[r.status] = (counts[r.status] ?? 0) + 1
        seen.set(r.public_id, (seen.get(r.public_id) ?? 0) + 1)
      }
      const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ public_id: id, n }))

      // Rows that can never become a receipt (no entry price to derive targets
      // from). Surfaced so it is a known number, not a silent drop.
      const excluded = await sql(
        `SELECT COUNT(*)::int AS n FROM ${side === 'short' ? 'telegram_alerts' : 'telegram_alerts_long'} WHERE entry_price IS NULL`,
      )

      const latest = rows[0]
      reports.push({
        side,
        dry: true,
        total: rows.length,
        counts,
        duplicates,
        excludedNoEntry: (excluded as unknown as { n: number }[])[0]?.n ?? 0,
        firstFiredAt: rows[rows.length - 1]?.fired_at ?? null,
        lastFiredAt: latest?.fired_at ?? null,
        nextCursor: rows.length === limit ? afterId + limit : null,
        samples: rows.slice(0, 5),
      })
    }

    return NextResponse.json({ ok: true, mode: apply ? 'apply' : 'dry', after: afterId, limit, reports })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[signals/backfill]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
