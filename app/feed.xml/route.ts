import { getAllArticlesFromDB } from '@/lib/data/articles-db'
import type { NextRequest } from 'next/server'

const BASE_URL = 'https://trading365.org'

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toRFC822(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
}

export async function GET(_req: NextRequest) {
  const articles = await getAllArticlesFromDB()

  const items = articles
    .slice(0, 50) // cap at 50 most recent
    .map((a) => {
      const url = `${BASE_URL}/${a.categorySlug}/${a.slug}`
      const pubDate = toRFC822(a.updatedDate || a.date)
      const thumbnail = a.thumbnail
        ? a.thumbnail.startsWith('http') ? a.thumbnail : `${BASE_URL}${a.thumbnail}`
        : null

      return `
    <item>
      <title>${esc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${esc(a.excerpt)}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${esc(a.category)}</category>
      ${thumbnail ? `<enclosure url="${esc(thumbnail)}" type="image/jpeg" length="0"/>` : ''}
    </item>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Trading365 — Crypto Exchange Reviews &amp; Guides</title>
    <link>${BASE_URL}</link>
    <description>Expert crypto exchange reviews, comparisons, and exclusive bonus deals.</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE_URL}/images/logo-wide.png</url>
      <title>Trading365</title>
      <link>${BASE_URL}</link>
    </image>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
