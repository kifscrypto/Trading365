import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { runQueue } from '@/lib/x-queue'
import { maxPostsPerDay, postingMode, xConfigured } from '@/lib/x'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// X posting cron. Vercel hits this with ?cron=true (and CRON_SECRET as a bearer
// header when configured); an admin session also works for manual runs.
//
//   /api/social/x?cron=true              → drain receipts, digest when due
//   /api/social/x?cron=true&digest=false → receipts only
//   /api/social/x?cron=true&digest=true  → force the digest check
//
// With X_POSTING_MODE unset (the default) this is a pure dry run: it logs the
// exact payloads and writes nothing, so the format and volume can be reviewed
// before any credential exists.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const digestParam = url.searchParams.get('digest')
  const out = await runQueue(digestParam === null ? {} : { includeDigest: digestParam !== 'false' })

  return NextResponse.json({
    ok: true,
    mode: postingMode(),
    configured: xConfigured(),
    maxPostsPerDay: maxPostsPerDay(),
    ...out,
  })
}