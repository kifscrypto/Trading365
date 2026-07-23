import { NextRequest, NextResponse } from "next/server"

// Token-gate the private broadcast surface. /live-arcade requires
// ?k=<LIVE_ACCESS_TOKEN>. Any missing/wrong token (or no token configured)
// returns a bare 404 so the route's existence is never confirmed to crawlers
// or probers. Valid responses are additionally marked noindex.
//
// NOTE: /live and /api/live are intentionally PUBLIC — /live is a live scanner
// demo people land on (it must never 404 them). It stays noindex via page
// metadata; a paid-user gate can be reintroduced here later.
export const config = {
  matcher: ["/live-arcade"],
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
