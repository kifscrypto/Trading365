import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getDeskDownloadDetails } from '@/lib/desk-download-tracking'
import { DESK_INSTALLER_URL } from '@/lib/desk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Deliberately NOT overridable by env: a stale DESK_DOWNLOAD_URL pinned to an
  // old release once kept serving v1.1.2 after 1.2.0 shipped. The stable
  // "latest release" URL is the single source of truth for the installer.
  const value = DESK_INSTALLER_URL
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
