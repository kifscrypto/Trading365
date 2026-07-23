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
    const hasId = Number.isInteger(id) && id > 0

    // Fallback key for beacons sent before the pageview POST returned a row id
    // (quick bounces). Must match the token shape /api/track accepts.
    const sid =
      typeof body.session_id === 'string' && /^[a-z0-9-]{1,40}$/i.test(body.session_id) ? body.session_id : null
    const path = typeof body.path === 'string' && body.path.length <= 512 ? body.path : null

    if (!hasId && !(sid && path)) return NextResponse.json({ ok: true })

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
    // Prefer the exact row id; otherwise update the most recent matching
    // session_id + path row from the last 15 minutes (this page view).
    if (hasId) {
      await sql`
        UPDATE page_views
        SET duration_ms = GREATEST(COALESCE(duration_ms, 0), ${durationMs ?? 0}),
            max_scroll_pct = GREATEST(COALESCE(max_scroll_pct, 0), ${scrollPct ?? 0})
        WHERE id = ${id}
      `
    } else {
      await sql`
        UPDATE page_views
        SET duration_ms = GREATEST(COALESCE(duration_ms, 0), ${durationMs ?? 0}),
            max_scroll_pct = GREATEST(COALESCE(max_scroll_pct, 0), ${scrollPct ?? 0})
        WHERE id = (
          SELECT id FROM page_views
          WHERE session_id = ${sid} AND path = ${path}
            AND created_at > NOW() - INTERVAL '15 minutes'
          ORDER BY created_at DESC
          LIMIT 1
        )
      `
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
