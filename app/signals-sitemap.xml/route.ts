import type { NextRequest } from 'next/server'
import { SITE } from '@/lib/signals/public'

// Hub-only sitemap. Individual receipt pages are noindex (proof-of-record
// pages for direct links, not search landing pages — thousands of identical
// numeric stubs dilute the site's quality signal), and a noindex URL in a
// sitemap is a contradiction Google reports as an error.
//
// No DB dependency: the hub entry is static, so a build-time ISR snapshot can
// never serve a degraded stub (the failure that froze the article sitemap
// during the Railway migration).
//
// Registered in app/robots.ts. Route lives at /signals-sitemap.xml (not
// /signals/sitemap.xml, which would collide with /signals/[public_id]).
export const revalidate = 3600

export async function GET(_req: NextRequest) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/signals</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
