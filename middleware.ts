import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/auth"

// Token-gate the private broadcast surface. /live-arcade requires
// ?k=<LIVE_ACCESS_TOKEN>. Any missing/wrong token (or no token configured)
// returns a bare 404 so the route's existence is never confirmed to crawlers
// or probers. Valid responses are additionally marked noindex.
//
// NOTE: /live and /api/live are intentionally PUBLIC — /live is a live scanner
// demo people land on (it must never 404 them). It stays noindex via page
// metadata; a paid-user gate can be reintroduced here later.
export const config = {
  matcher: ["/live-arcade", "/ops", "/ops/:path*"],
}

function notFound() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

export async function middleware(req: NextRequest) {
  // /ops — Operations Command Center (static dashboard baked into public/ops).
  // Gated behind the same admin session as the admin panel; unauthenticated
  // visitors are sent to the admin login. Always noindex.
  if (req.nextUrl.pathname.startsWith("/ops")) {
    if (!(await verifyAdmin(req))) {
      const login = new URL("/admin/login", req.url)
      login.searchParams.set("next", req.nextUrl.pathname)
      return NextResponse.redirect(login)
    }
    const res = NextResponse.next()
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
    return res
  }

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
