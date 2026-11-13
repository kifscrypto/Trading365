import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getDeskDownloadDetails } from '@/lib/desk-download-tracking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const value = process.env.DESK_DOWNLOAD_URL
  if (!value) return NextResponse.json({ error: 'The T365 Desk installer is not hosted yet.' }, { status: 503 })
  let url: URL
  try { url = new URL(value) } catch {
    return NextResponse.json({ error: 'The installer URL is not configured correctly.' }, { status: 503 })
  }
  if (url.protocol !== 'https:') {
    return NextResponse.json({ error: 'The installer URL must use HTTPS.' }, { status: 503 })
  }

  const details = getDeskDownloadDetails(request.headers)
  try {
    await sql`
      INSERT INTO desk_downloads (product, country, is_bot, user_agent)
      VALUES ('t365-desk', ${details.country}, ${details.isBot}, ${details.userAgent})
    `
  } catch (error) {
    console.error('[desk] Failed to record download:', error)
  }
  return NextResponse.redirect(url, 307)
}
