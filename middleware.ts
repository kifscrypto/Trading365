import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/auth"
import { SESSION_COOKIE, SIGNED_IN_COOKIE } from "@/lib/auth-cookies"

// Token-gate the private broadcast surface. /live-arcade requires
// ?k=<LIVE_ACCESS_TOKEN>. Any missing/wrong token (or no token configured)
// returns a bare 404 so the route's existence is never confirmed to crawlers
// or probers. Valid responses are additionally marked noindex.
//
// NOTE: /live and /api/live are intentionally PUBLIC — /live is a live scanner
// demo people land on (it must never 404 them). It stays noindex via page
// metadata; a paid-user gate can be reintroduced here later.
//
// The catch-all page pattern is here for the signed-in flag sync below — the
// /ops and /live-arcade branches are matched by it too and keep their explicit
// entries only as documentation. _next assets, API routes and file URLs are
// excluded: none of them render the header the flag exists for.
export const config = {
  matcher: [
    "/live-arcade",
    "/ops",
    "/ops/:path*",
    "/((?!_next/|api/|.*\\..*).*)",
  ],
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

  if (req.nextUrl.pathname === "/live-arcade") {
    const expected = process.env.LIVE_ACCESS_TOKEN
    const provided = req.nextUrl.searchParams.get("k")

    // No token configured, or mismatch → indistinguishable from a real 404.
    if (!expected || !provided || provided !== expected) {
      return notFound()
    }

    const res = NextResponse.next()
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
    return res
  }

  return syncSignedInFlag(req)
}

/**
 * The header picks "My account" vs "Sign in" from SIGNED_IN_COOKIE, a
 * client-readable flag minted at login (app/layout.tsx sets data-auth from it
 * pre-paint; app/globals.css swaps the buttons). Anyone whose session predates
 * that mechanism holds t365_session WITHOUT the flag, and would see the
 * signed-out header for the remaining life of their 30-day session. Rather
 * than make every member sign in again, reconcile on each page request:
 *
 *   session cookie, no flag → mint the flag (existing session, pre-change)
 *   flag, no session cookie → clear the flag (expired/revoked session), so a
 *     signed-out visitor never gets offered "My account" only to bounce off
 *     /account's login redirect
 *
 * The flag's value is the constant '1' and authorises nothing — keeping it in
 * lockstep with the session cookie's PRESENCE is all the header needs. The one
 * approximation: a backfilled flag gets a fresh 30 days while the session may
 * expire sooner, but the next request after the browser drops the expired
 * session cookie lands in the "flag, no session" branch and clears it.
 */
function syncSignedInFlag(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE)
  const hasFlag = req.cookies.has(SIGNED_IN_COOKIE)
  if (hasSession === hasFlag) return NextResponse.next()

  const res = NextResponse.next()
  if (hasSession) {
    // Same attributes as signedInCookie() in lib/users.ts, which middleware
    // cannot import (it creates a database client at module scope).
    res.cookies.set(SIGNED_IN_COOKIE, "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
  } else {
    res.cookies.set(SIGNED_IN_COOKIE, "", { path: "/", maxAge: 0 })
  }
  return res
}
