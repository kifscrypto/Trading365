import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { sql } from '@/lib/db'

// Bot / non-human User-Agent signatures. The client-side PageTracker only fires
// from JS-executing clients, so most server-side crawlers never reach here — what
// lands is real browsers plus headless automation. We now STORE flagged hits
// (is_bot = true) instead of dropping them, so the dashboard can report a bot share.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|semrush|ahrefs|headless|puppeteer|playwright|phantom|selenium|python|curl|wget|http-client|go-http|axios|node-fetch|java\/|okhttp|bytespider|gptbot|claudebot|ccbot|dataforseo|petalbot|yandex|bingpreview/i

/**
 * Privacy-safe visitor id: a daily-rotating hash of IP+UA. The salt rotates every
 * UTC day so the value can't be used to track a person across days or reversed to
 * an IP — no raw IP is ever stored. Distinct visitor_ids within a day ≈ unique
 * visitors (the Plausible model). Set ANALYTICS_SALT in the environment to harden.
 */
function visitorId(ip: string | null, ua: string): string | null {
  if (!ip && !ua) return null
  const day = new Date().toISOString().slice(0, 10)
  const salt = `${day}|${process.env.ANALYTICS_SALT || 'trading365-pv-salt'}`
  return createHash('sha256').update(`${salt}|${ip || ''}|${ua}`).digest('hex').slice(0, 20)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { path, referrer, utm_source, utm_medium, utm_campaign, session_id } = body

    // Skip admin pages, empty paths, and admin sessions
    if (!path || path.startsWith('/admin') || req.cookies.get('admin_auth')) {
      return NextResponse.json({ ok: true })
    }

    // Country from Vercel edge headers
    const country =
      req.headers.get('x-vercel-ip-country') ||
      req.headers.get('cf-ipcountry') ||
      null

    const ua = req.headers.get('user-agent') || ''
    // First hop of x-forwarded-for is the client IP on Vercel; used only to derive
    // the hashed visitor id — never stored in raw form.
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null

    const device = /mobile|android|iphone|ipad/i.test(ua)
      ? 'mobile'
      : /tablet/i.test(ua)
      ? 'tablet'
      : 'desktop'

    const isBot = !ua || BOT_UA.test(ua)
    const vid = visitorId(ip, ua)

    // Session id is minted client-side (30-min inactivity window) and grouped here.
    // Constrain to a sane token so it can't be abused as an arbitrary text sink.
    const sid = typeof session_id === 'string' && /^[a-z0-9-]{1,40}$/i.test(session_id) ? session_id : null

    const rows = await sql`
      INSERT INTO page_views (path, referrer, utm_source, utm_medium, utm_campaign, country, device, user_agent, visitor_id, is_bot, session_id)
      VALUES (
        ${path},
        ${referrer || null},
        ${utm_source || null},
        ${utm_medium || null},
        ${utm_campaign || null},
        ${country},
        ${device},
        ${ua || null},
        ${vid},
        ${isBot},
        ${sid}
      )
      RETURNING id
    `

    // Return the row id so the client can backfill dwell time + scroll depth on leave.
    return NextResponse.json({ ok: true, id: rows[0]?.id ?? null })
  } catch {
    // Silent fail — never break the user experience for tracking
    return NextResponse.json({ ok: true })
  }
}
