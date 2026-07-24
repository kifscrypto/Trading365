/**
 * Replace ONLY the content column of one translation row from a file.
 * Verifies length is sane vs English before writing (guards against re-abridging).
 *
 *   node --env-file=.env.local scripts/upsert-content.mjs <slug> <locale> <file> [--apply]
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const [slug, locale, file] = process.argv.slice(2)
const APPLY = process.argv.includes('--apply')
if (!slug || !locale || !file) { console.error('usage: <slug> <locale> <file> [--apply]'); process.exit(1) }

const sql = neon(process.env.DATABASE_URL)
const content = readFileSync(file, 'utf8').trim()

const [en] = await sql`SELECT length(content) en FROM articles WHERE slug=${slug}`
const [ex] = await sql`SELECT id, length(content) cur FROM article_translations WHERE article_slug=${slug} AND locale=${locale}`
if (!en) { console.error('no English article', slug); process.exit(1) }

const cjk = ['zh-CN','zh-TW','ja','ko'].includes(locale)
const ratio = content.length / en.en
const floor = cjk ? 0.22 : 0.55
console.log(`${slug} / ${locale}: new=${content.length} chars, EN=${en.en}, ratio=${Math.round(ratio*100)}% (floor ${Math.round(floor*100)}%), existing row=${ex ? ex.cur+' chars' : 'NONE'}`)
if (ratio < floor) { console.error(`✗ REFUSED: translation too short vs English (${Math.round(ratio*100)}%) — looks abridged. Not writing.`); process.exit(2) }

if (APPLY) {
  if (ex) await sql`UPDATE article_translations SET content=${content}, translated_at=NOW() WHERE id=${ex.id}`
  else { console.error('row does not exist; use full upsert for missing rows'); process.exit(1) }
  console.log('✓ content updated')
} else {
  console.log('DRY RUN — pass --apply to write')
}
