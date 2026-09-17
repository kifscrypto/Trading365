/**
 * Compare every exchanges[].fullReview path against the actual article in the DB:
 * its category_slug, AND whether it is published. Report mismatches so we can
 * update the static exchanges.ts to point at canonical URLs (avoids extra 301 hop).
 *
 * The published check matters as much as the category one: getArticleBySlug
 * filters `published = true`, so a path whose article is still a DRAFT returns
 * 404 — and it used to pass this audit silently, because the slug existed and the
 * category matched. Three exchanges (BloFin, KCEX, Novava) were linked to drafts
 * that way. Bare category hubs (e.g. "/no-kyc") are accepted as intentional.
 *
 * Run with: node --env-file=.env.local scripts/audit-full-review-paths.mjs
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const sql = neon(process.env.DATABASE_URL)

const CATEGORY_HUBS = new Set(['/reviews', '/comparisons', '/bonuses', '/no-kyc', '/guides', '/scam-alerts', '/audits'])

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

const articleRows = await sql`SELECT slug, category_slug, published FROM articles`
const dbCategoryBySlug = Object.fromEntries(articleRows.map(r => [r.slug, r.category_slug]))
const dbPublishedBySlug = Object.fromEntries(articleRows.map(r => [r.slug, r.published]))

console.log(`DB articles: ${articleRows.length}`)
console.log(`Exchanges parsed: ${records.length}`)
console.log(`Exchanges with fullReview: ${records.filter(r => r.fullReview).length}\n`)

const mismatches = []
const missing = []
const ok = []

for (const r of records) {
  if (!r.fullReview) continue
  if (CATEGORY_HUBS.has(r.fullReview)) {
    ok.push(`${r.name} (category hub ${r.fullReview})`)
    continue
  }
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
  if (dbPublishedBySlug[urlSlug] === false) {
    missing.push({ ...r, articleSlug: urlSlug, reason: 'article is UNPUBLISHED — this path 404s' })
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
