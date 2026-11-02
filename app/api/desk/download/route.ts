import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const value = process.env.DESK_DOWNLOAD_URL
  if (!value) return NextResponse.json({ error: 'The T365 Desk installer is not hosted yet.' }, { status: 503 })
  let url: URL
  try { url = new URL(value) } catch {
    return NextResponse.json({ error: 'The installer URL is not configured correctly.' }, { status: 503 })
  }
  if (url.protocol !== 'https:') {
    return NextResponse.json({ error: 'The installer URL must use HTTPS.' }, { status: 503 })
  }
  return NextResponse.redirect(url, 307)
}
