import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * Engagement backfill. When a visitor leaves a page, the client sends a
 * navigator.sendBeacon with the page_views row id plus how long they stayed
 * (duration_ms) and how far they scrolled (max_scroll_pct 0-100). We update the
 * existing row rather than inserting — one row per page view stays the model.
 *
 * Silent-fail by design: tracking must never surface an error to the user, and a
 * beacon that arrives after the row is gone (or with junk) is simply ignored.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: true })

    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: true })

    // Clamp to sane bounds: cap dwell at 30 min (beyond that is almost always an
    // idle/backgrounded tab, not real reading), scroll to 0-100.
    const duration = Number(body.duration_ms)
    const durationMs =
      Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 30 * 60 * 1000) : null

    const scroll = Number(body.scroll_pct)
    const scrollPct =
      Number.isFinite(scroll) ? Math.max(0, Math.min(100, Math.round(scroll))) : null

    if (durationMs === null && scrollPct === null) return NextResponse.json({ ok: true })

    // GREATEST keeps the largest value seen — a later beacon (e.g. the tab
    // regained focus and was left again) never shrinks recorded engagement.
    await sql`
      UPDATE page_views
      SET duration_ms = GREATEST(COALESCE(duration_ms, 0), ${durationMs ?? 0}),
          max_scroll_pct = GREATEST(COALESCE(max_scroll_pct, 0), ${scrollPct ?? 0})
      WHERE id = ${id}
    `

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
