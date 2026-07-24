import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { exchangeFromUrl } from "@/lib/affiliate-domains"

// Records an outbound affiliate-link click. Mirrors /api/track: silent-fail so it
// can never break the click, skips admin traffic, and reuses the same daily-hashed
// visitor_id so click rows line up with same-day page views.

const BOT_UA =
  /bot|crawl|spider|slurp|bing|google|baidu|yandex|duckduck|facebookexternalhit|embedly|preview|monitor|curl|wget|python-requests|headless|lighthouse|axios|http-client/i

function visitorId(ip: string | null, ua: string): string | null {
  if (!ip && !ua) return null
  const day = new Date().toISOString().slice(0, 10)
  const salt = `${day}|${process.env.ANALYTICS_SALT || "trading365-pv-salt"}`
  return createHash("sha256").update(`${salt}|${ip || ""}|${ua}`).digest("hex").slice(0, 20)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: true })

    const { url, path, article_slug, locale, session_id } = body as Record<string, unknown>
    const targetUrl = typeof url === "string" ? url : ""
    if (!targetUrl) return NextResponse.json({ ok: true })

    // Classify server-side (don't trust a client-supplied exchange); drop non-affiliate URLs.
    const exchange = exchangeFromUrl(targetUrl)
    if (!exchange) return NextResponse.json({ ok: true })

    // Ignore our own admin traffic.
    if (req.cookies.get("admin_auth")) return NextResponse.json({ ok: true })
    if (typeof path === "string" && path.startsWith("/admin")) return NextResponse.json({ ok: true })

    const ua = req.headers.get("user-agent") || ""
    const fwd = req.headers.get("x-forwarded-for")
    const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip") || null
    const isBot = !ua || BOT_UA.test(ua)
    const country = req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || null
    const vid = visitorId(ip, ua)
    const sid =
      typeof session_id === "string" && /^[a-z0-9-]{1,40}$/i.test(session_id) ? session_id : null

    await sql`
      INSERT INTO affiliate_clicks
        (exchange, target_url, path, article_slug, locale, visitor_id, session_id, country, is_bot, user_agent)
      VALUES (
        ${exchange},
        ${targetUrl.slice(0, 500)},
        ${typeof path === "string" ? path.slice(0, 300) : null},
        ${typeof article_slug === "string" ? article_slug.slice(0, 200) : null},
        ${typeof locale === "string" ? locale.slice(0, 10) : null},
        ${vid},
        ${sid},
        ${country},
        ${isBot},
        ${ua.slice(0, 300)}
      )
    `
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
