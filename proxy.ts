import { NextRequest, NextResponse } from "next/server"

// All supported locale codes — must stay in sync with lib/i18n/config.ts
const LOCALE_CODES = ["es", "pt", "de", "fr", "ja", "ko", "ru", "zh-CN", "zh-TW"]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Extract first path segment
  const segments = pathname.split("/").filter(Boolean)
  const first = segments[0]

  if (first && LOCALE_CODES.includes(first)) {
    // Rewrite /es/... → /_locale/es/... (internal, URL stays the same for user)
    const rest = segments.slice(1).join("/")
    const rewriteUrl = req.nextUrl.clone()
    rewriteUrl.pathname = `/_locale/${first}${rest ? `/${rest}` : ""}`
    return NextResponse.rewrite(rewriteUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all paths except static files and Next.js internals
  matcher: ["/((?!_next|api|images|favicon|robots|sitemap|llms|.*\\..*).*)"],
}
