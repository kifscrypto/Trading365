import type { NextRequest } from 'next/server'
import { SITE, getReceiptSitemapEntries, getArchiveStats } from '@/lib/signals/public'

// Signal receipts get their own sitemap so the article sitemap stays untouched
// and archive history can be switched on/off independently via
// SIGNALS_BACKFILL_INDEXABLE. This endpoint lists ONLY indexable URLs — a
// noindex URL in a sitemap is a contradiction Google reports as an error.
//
// Registered in app/robots.ts. Route lives at /signals-sitemap.xml (not
// /signals/sitemap.xml, which would collide with /signals/[public_id]).
export const revalidate = 3600

export async function GET(_req: NextRequest) {
  const entries = await getReceiptSitemapEntries()

  // The hub is always included so the sitemap is never empty (an empty sitemap
  // is itself a Search Console error) and the archive is discoverable.
  const newest = entries[0]?.lastmod
  const hubLastmod = newest && !isNaN(new Date(newest).getTime())
    ? new Date(newest).toISOString()
    : new Date().toISOString()

  // public_id is constrained to [a-z0-9-] by construction, so it needs no XML
  // escaping — but it is escaped anyway so that constraint can never be the only
  // thing standing between a bad row and a malformed sitemap.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const urls = [
    `  <url><loc>${SITE}/signals</loc><lastmod>${hubLastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`,
    ...entries.map((e) => {
      const d = new Date(e.lastmod)
      const lastmod = isNaN(d.getTime()) ? '' : `<lastmod>${d.toISOString()}</lastmod>`
      return `  <url><loc>${SITE}/signals/${esc(e.public_id)}</loc>${lastmod}<changefreq>yearly</changefreq><priority>0.4</priority></url>`
    }),
  ].join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}