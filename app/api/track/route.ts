import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { path, referrer, utm_source, utm_medium, utm_campaign } = body

    // Skip admin pages and empty paths
    if (!path || path.startsWith('/admin')) {
      return NextResponse.json({ ok: true })
    }

    // Country from Vercel edge headers
    const country =
      req.headers.get('x-vercel-ip-country') ||
      req.headers.get('cf-ipcountry') ||
      null

    // Simple device detection from User-Agent
    const ua = req.headers.get('user-agent') || ''
    const device = /mobile|android|iphone|ipad/i.test(ua)
      ? 'mobile'
      : /tablet/i.test(ua)
      ? 'tablet'
      : 'desktop'

    // Skip bots
    if (/bot|crawl|spider|slurp|facebookexternalhit|semrush|ahrefs/i.test(ua)) {
      return NextResponse.json({ ok: true })
    }

    await sql`
      INSERT INTO page_views (path, referrer, utm_source, utm_medium, utm_campaign, country, device)
      VALUES (
        ${path},
        ${referrer || null},
        ${utm_source || null},
        ${utm_medium || null},
        ${utm_campaign || null},
        ${country},
        ${device}
      )
    `

    return NextResponse.json({ ok: true })
  } catch {
    // Silent fail — never break the user experience for tracking
    return NextResponse.json({ ok: true })
  }
}
