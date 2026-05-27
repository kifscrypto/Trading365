/**
 * Compare every exchanges[].fullReview path against the actual category_slug
 * of the matching article in the DB. Report mismatches so we can update the
 * static exchanges.ts to point at canonical URLs (avoids extra 301 hop).
 *
 * Run with: node --env-file=.env.local scripts/audit-full-review-paths.mjs
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const sql = neon(process.env.DATABASE_URL)

const src = readFileSync(new URL('../lib/data/exchanges.ts', import.meta.url), 'utf8')

// Each exchange block looks like:
//   slug: "weex",
//   name: "WEEX",
//   ...
//   fullReview: "/reviews/weex-review",
// Extract (name, slug, fullReview) triples by walking object literals.
const blocks = src.split(/\n\s*\{\s*\n/).slice(1)  // each block starts after "{\n"
const records = []
for (const b of blocks) {
  const nameMatch = b.match(/name:\s*"([^"]+)"/)
  const slugMatch = b.match(/slug:\s*"([^"]+)"/)
  const fullReviewMatch = b.match(/fullReview:\s*"([^"]+)"/)
  if (!nameMatch || !slugMatch) continue
  records.push({
    name: nameMatch[1],
    exchangeSlug: slugMatch[1],
    fullReview: fullReviewMatch?.[1] ?? null,
  })
}

const articleRows = await sql`SELECT slug, category_slug FROM articles`
const dbCategoryBySlug = Object.fromEntries(articleRows.map(r => [r.slug, r.category_slug]))

console.log(`DB articles: ${articleRows.length}`)
console.log(`Exchanges parsed: ${records.length}`)
console.log(`Exchanges with fullReview: ${records.filter(r => r.fullReview).length}\n`)

const mismatches = []
const missing = []
const ok = []

for (const r of records) {
  if (!r.fullReview) continue
  const match = r.fullReview.match(/^\/([^/]+)\/([^/?#]+)/)
  if (!match) {
    missing.push({ ...r, reason: 'unparseable' })
    continue
  }
  const [, urlCat, urlSlug] = match
  const dbCat = dbCategoryBySlug[urlSlug]
  if (!dbCat) {
    missing.push({ ...r, articleSlug: urlSlug, reason: 'article slug not in DB' })
    continue
  }
  if (urlCat !== dbCat) {
    mismatches.push({ ...r, articleSlug: urlSlug, urlCat, dbCat, correctPath: `/${dbCat}/${urlSlug}` })
  } else {
    ok.push(r.name)
  }
}

console.log(`✓ Correct: ${ok.length}`)
console.log(`✗ Mismatched: ${mismatches.length}`)
console.log(`? Not in DB / unparseable: ${missing.length}\n`)

if (mismatches.length) {
  console.log('MISMATCHES (these cause an extra 301 hop):')
  for (const m of mismatches) {
    console.log(`  ${m.name.padEnd(22)} ${m.fullReview}  →  ${m.correctPath}`)
  }
}

if (missing.length) {
  console.log('\nNOT IN DB:')
  for (const m of missing) {
    console.log(`  ${m.name.padEnd(22)} ${m.fullReview} (${m.reason})`)
  }
}
