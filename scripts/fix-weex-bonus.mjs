/**
 * Updates the WEEX welcome bonus figure across the WEEX review article body
 * and any translated copies in article_translations.
 *
 * Replaces "$500 USDT" → "$10,000 USDT" inside content (and translated content,
 * meta_title, meta_description, excerpt where applicable). Leaves the
 * "500,000 USDT" daily withdrawal limit references untouched.
 *
 * Run with: node --env-file=.env.local scripts/fix-weex-bonus.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const SLUG = 'weex-review'
const FROM = '$500 USDT'
const TO = '$10,000 USDT'

function countMatches(haystack, needle) {
  if (!haystack) return 0
  return haystack.split(needle).length - 1
}

// Main article row
const mainRows = await sql`SELECT id, content, excerpt, meta_title, meta_description FROM articles WHERE slug = ${SLUG} LIMIT 1`
if (!mainRows.length) {
  console.error(`Article "${SLUG}" not found in articles table`)
  process.exit(1)
}

const main = mainRows[0]
const mainHits = {
  content: countMatches(main.content, FROM),
  excerpt: countMatches(main.excerpt, FROM),
  meta_title: countMatches(main.meta_title, FROM),
  meta_description: countMatches(main.meta_description, FROM),
}
const mainTotal = Object.values(mainHits).reduce((a, b) => a + b, 0)

console.log(`Main article (${SLUG}): ${mainTotal} occurrence(s) of "${FROM}"`)
console.log('  →', mainHits)

if (mainTotal > 0) {
  await sql`
    UPDATE articles SET
      content = REPLACE(content, ${FROM}, ${TO}),
      excerpt = REPLACE(excerpt, ${FROM}, ${TO}),
      meta_title = REPLACE(COALESCE(meta_title, ''), ${FROM}, ${TO}),
      meta_description = REPLACE(COALESCE(meta_description, ''), ${FROM}, ${TO}),
      updated_at = NOW()
    WHERE id = ${main.id}
  `
  console.log(`  ✓ Updated main article`)
} else {
  console.log(`  (nothing to change in main article)`)
}

// Translated copies
const transRows = await sql`SELECT id, locale, content, excerpt, meta_title, meta_description FROM article_translations WHERE article_slug = ${SLUG}`
console.log(`\nTranslations found: ${transRows.length}`)

let transUpdated = 0
for (const t of transRows) {
  const hits = {
    content: countMatches(t.content, FROM),
    excerpt: countMatches(t.excerpt, FROM),
    meta_title: countMatches(t.meta_title, FROM),
    meta_description: countMatches(t.meta_description, FROM),
  }
  const total = Object.values(hits).reduce((a, b) => a + b, 0)
  console.log(`  [${t.locale}] ${total} occurrence(s)`, hits)

  if (total > 0) {
    await sql`
      UPDATE article_translations SET
        content = REPLACE(content, ${FROM}, ${TO}),
        excerpt = REPLACE(COALESCE(excerpt, ''), ${FROM}, ${TO}),
        meta_title = REPLACE(COALESCE(meta_title, ''), ${FROM}, ${TO}),
        meta_description = REPLACE(COALESCE(meta_description, ''), ${FROM}, ${TO})
      WHERE id = ${t.id}
    `
    transUpdated++
  }
}

console.log(`\nDone. Main updated: ${mainTotal > 0 ? 'yes' : 'no'}. Translations updated: ${transUpdated}/${transRows.length}.`)
