/**
 * Batch insert/replace FULL translation rows from a JSON array file:
 *   [{ slug, locale, title, excerpt, content, meta_title, meta_description }, ...]
 * Each row is validated (fields present, title sane, content length vs EN) before writing.
 *
 *   node --env-file=.env.local scripts/batch-upsert-translations.mjs <json> [--apply]
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const jsonPath = process.argv[2]
const APPLY = process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)
const rows = JSON.parse(readFileSync(jsonPath, 'utf8'))

const enLen = new Map()
for (const a of await sql`SELECT slug, length(content) en FROM articles`) enLen.set(a.slug, a.en)

let ok = 0, refused = 0
for (const t of rows) {
  const miss = ['slug','locale','title','excerpt','content','meta_title','meta_description'].filter(k => !t[k] || !String(t[k]).trim())
  if (miss.length) { console.error(`✗ ${t.slug}/${t.locale}: missing ${miss.join(',')}`); refused++; continue }
  if (t.title.includes('\n') || t.title.length > 120) { console.error(`✗ ${t.slug}/${t.locale}: bad title`); refused++; continue }
  const en = enLen.get(t.slug)
  if (!en) { console.error(`✗ ${t.slug}: no EN article`); refused++; continue }
  const cjk = ['zh-CN','zh-TW','ja','ko'].includes(t.locale)
  const ratio = t.content.length / en
  const floor = cjk ? 0.22 : 0.55
  if (ratio < floor) { console.error(`✗ ${t.slug}/${t.locale}: content ${Math.round(ratio*100)}% of EN — abridged`); refused++; continue }
  console.log(`✓ ${t.slug}/${t.locale}: ${t.content.length} chars (${Math.round(ratio*100)}% of EN)`)
  if (APPLY) await sql`
    INSERT INTO article_translations (article_slug, locale, title, excerpt, content, meta_title, meta_description, translated_at)
    VALUES (${t.slug}, ${t.locale}, ${t.title}, ${t.excerpt}, ${t.content}, ${t.meta_title}, ${t.meta_description}, NOW())
    ON CONFLICT (article_slug, locale) DO UPDATE SET
      title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, content=EXCLUDED.content,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description, translated_at=NOW()`
  ok++
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${ok} valid, ${refused} refused`)
if (!APPLY && ok) console.log('Pass --apply to write.')
