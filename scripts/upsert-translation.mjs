/**
 * Insert/replace a FULL translation row from a JSON file:
 *   { title, excerpt, content, meta_title, meta_description }
 * Verifies content length vs English before writing (guards re-abridging).
 *
 *   node --env-file=.env.local scripts/upsert-translation.mjs <slug> <locale> <json> [--apply]
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const [slug, locale, jsonPath] = process.argv.slice(2)
const APPLY = process.argv.includes('--apply')
if (!slug || !locale || !jsonPath) { console.error('usage: <slug> <locale> <json> [--apply]'); process.exit(1) }

const sql = neon(process.env.DATABASE_URL)
const t = JSON.parse(readFileSync(jsonPath, 'utf8'))
for (const k of ['title','excerpt','content','meta_title','meta_description'])
  if (!t[k] || !String(t[k]).trim()) { console.error(`✗ missing field: ${k}`); process.exit(1) }
if (t.title.includes('\n') || t.title.length > 120) { console.error('✗ title looks corrupt (newline/too long)'); process.exit(2) }

const [en] = await sql`SELECT length(content) en FROM articles WHERE slug=${slug}`
if (!en) { console.error('no English article', slug); process.exit(1) }
const cjk = ['zh-CN','zh-TW','ja','ko'].includes(locale)
const ratio = t.content.length / en.en
const floor = cjk ? 0.22 : 0.55
console.log(`${slug}/${locale}: content=${t.content.length} (${Math.round(ratio*100)}% of EN ${en.en}, floor ${Math.round(floor*100)}%)`)
if (ratio < floor) { console.error('✗ REFUSED: content too short vs English — looks abridged.'); process.exit(2) }

if (APPLY) {
  await sql`
    INSERT INTO article_translations (article_slug, locale, title, excerpt, content, meta_title, meta_description, translated_at)
    VALUES (${slug}, ${locale}, ${t.title}, ${t.excerpt}, ${t.content}, ${t.meta_title}, ${t.meta_description}, NOW())
    ON CONFLICT (article_slug, locale) DO UPDATE SET
      title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, content=EXCLUDED.content,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description, translated_at=NOW()`
  console.log('✓ row written')
} else {
  console.log('DRY RUN — pass --apply to write')
}
