import { NextResponse } from 'next/server'
import { DESK_PRODUCT } from '@/lib/desk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = 'https://trading365.org'

/**
 * Version feed consumed by the installed T365 Terminal app to notify users when a
 * newer build is published. Bump DESK_PRODUCT.version (or set
 * DESK_LATEST_VERSION) on each desktop release.
 */
export function GET() {
  const version = process.env.DESK_LATEST_VERSION?.trim() || DESK_PRODUCT.version
  const notes = process.env.DESK_LATEST_NOTES?.trim() || null
  const releasedAt = process.env.DESK_LATEST_RELEASED_AT?.trim() || null
  return NextResponse.json({
    version,
    downloadUrl: `${BASE_URL}${DESK_PRODUCT.downloadPath}`,
    pageUrl: `${BASE_URL}/terminal`,
    notes,
    releasedAt,
  })
}
