/**
 * Repair corrupted short fields (title / meta_title / meta_description) in
 * article_translations. Corruption = a runaway body was appended after the real
 * value. The correct value is the first non-empty line (minus any leading
 * markdown heading marker / wrapping quotes).
 *
 * Dry run (default):  node --env-file=.env.local scripts/repair-short-fields.mjs
 * Apply:              node --env-file=.env.local scripts/repair-short-fields.mjs --apply
 */
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL)
const APPLY = process.argv.includes('--apply')

function cleanField(s) {
  if (s == null) return s
  let first = String(s).split(/\r?\n/).find(l => l.trim().length) || ''
  first = first.replace(/^﻿/, '').replace(/^#{1,6}\s+/, '').trim()
  first = first.replace(/^["'“”『「«]+/, '').replace(/["'“”』」»]+$/, '').trim()
  return first
}
const badTitle = (s) => s != null && (s.includes('\n') || s.length > 120)
const badDesc  = (s) => s != null && (s.includes('\n') || s.length > 400)

const rows = await sql`SELECT id, article_slug, locale, title, meta_title, meta_description FROM article_translations ORDER BY article_slug, locale`

let nTitle = 0, nMeta = 0, nDesc = 0, sample = []
for (const r of rows) {
  const upd = {}
  if (badTitle(r.title))          { upd.title = cleanField(r.title); nTitle++ }
  if (badTitle(r.meta_title))     { upd.meta_title = cleanField(r.meta_title); nMeta++ }
  if (badDesc(r.meta_description)){ upd.meta_description = cleanField(r.meta_description); nDesc++ }
  if (!Object.keys(upd).length) continue

  if (sample.length < 8) sample.push({ slug: r.article_slug.slice(0, 28), locale: r.locale,
    field: Object.keys(upd)[0], was_len: (r[Object.keys(upd)[0]] || '').length, now: upd[Object.keys(upd)[0]] })

  if (APPLY) {
    // build dynamic update
    if (upd.title !== undefined && upd.meta_title !== undefined && upd.meta_description !== undefined)
      await sql`UPDATE article_translations SET title=${upd.title}, meta_title=${upd.meta_title}, meta_description=${upd.meta_description} WHERE id=${r.id}`
    else if (upd.title !== undefined && upd.meta_title !== undefined)
      await sql`UPDATE article_translations SET title=${upd.title}, meta_title=${upd.meta_title} WHERE id=${r.id}`
    else if (upd.title !== undefined && upd.meta_description !== undefined)
      await sql`UPDATE article_translations SET title=${upd.title}, meta_description=${upd.meta_description} WHERE id=${r.id}`
    else if (upd.meta_title !== undefined && upd.meta_description !== undefined)
      await sql`UPDATE article_translations SET meta_title=${upd.meta_title}, meta_description=${upd.meta_description} WHERE id=${r.id}`
    else if (upd.title !== undefined)
      await sql`UPDATE article_translations SET title=${upd.title} WHERE id=${r.id}`
    else if (upd.meta_title !== undefined)
      await sql`UPDATE article_translations SET meta_title=${upd.meta_title} WHERE id=${r.id}`
    else if (upd.meta_description !== undefined)
      await sql`UPDATE article_translations SET meta_description=${upd.meta_description} WHERE id=${r.id}`
  }
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} — would fix: title=${nTitle}, meta_title=${nMeta}, meta_description=${nDesc}`)
console.log('\nSample (before length → cleaned value):')
console.table(sample.map(s => ({ ...s, now: s.now.slice(0, 55) })))
if (!APPLY) console.log('\nRe-run with --apply to write.')
