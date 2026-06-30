import { NextRequest, NextResponse } from "next/server"

// Token-gate the private broadcast surface. BOTH /live and /api/live require
// ?k=<LIVE_ACCESS_TOKEN>. Any missing/wrong token (or no token configured)
// returns a bare 404 so the routes' existence is never confirmed to crawlers
// or probers. Valid /live responses are additionally marked noindex.
// (The page is showcased only during live streams via the ?k= URL — it is NOT
// linked publicly.)
export const config = {
  matcher: ["/live", "/live-arcade", "/api/live"],
}

function notFound() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

export function middleware(req: NextRequest) {
  const expected = process.env.LIVE_ACCESS_TOKEN
  const provided = req.nextUrl.searchParams.get("k")

  // No token configured, or mismatch → indistinguishable from a real 404.
  if (!expected || !provided || provided !== expected) {
    return notFound()
  }

  const res = NextResponse.next()
  if (req.nextUrl.pathname.startsWith("/live")) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  }
  return res
}
