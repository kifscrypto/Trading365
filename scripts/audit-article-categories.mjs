/**
 * Audit: list every article's canonical category_slug from the DB, then probe
 * every wrong-category URL to confirm the page template renders the article
 * regardless of URL category (i.e. duplicate content via category-agnostic routing).
 *
 * Run with: node --env-file=.env.local scripts/audit-article-categories.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const rows = await sql`SELECT slug, category_slug, title FROM articles ORDER BY category_slug, slug`
console.log(`Total articles in DB: ${rows.length}\n`)

const byCat = {}
for (const r of rows) {
  byCat[r.category_slug] = (byCat[r.category_slug] || 0) + 1
}
console.log('Category breakdown:')
for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat}: ${n}`)

const weex = rows.find(r => r.slug === 'weex-review')
console.log(`\nweex-review canonical category in DB: ${weex?.category_slug ?? 'NOT FOUND'}`)

// Probe both URLs to see what each returns
console.log('\nProbing both URLs:')
const urls = [
  'https://trading365.org/reviews/weex-review',
  'https://trading365.org/no-kyc/weex-review',
  'https://trading365.org/guides/weex-review',
  'https://trading365.org/audits/weex-review',
  'https://trading365.org/comparisons/weex-review',
]
for (const url of urls) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    console.log(`  ${url} -> ${res.status}${res.headers.get('location') ? ' → ' + res.headers.get('location') : ''}`)
  } catch (e) {
    console.log(`  ${url} -> ERROR ${e.message}`)
  }
}
