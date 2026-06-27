import { NextResponse } from "next/server"

// /live is now a PUBLIC, read-only scanner display (linked from the site header
// so visitors can watch the scanner in action without YouTube). It is still
// marked noindex (it's a real-time dashboard, not SEO content) via this header
// plus the route's own robots metadata. No token gate anymore; the old
// ?k=<LIVE_ACCESS_TOKEN> broadcast URL still works (the param is simply ignored)
// and /api/live is open so the public page can poll it.
export const config = {
  matcher: ["/live"],
}

export function middleware() {
  const res = NextResponse.next()
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  return res
}
