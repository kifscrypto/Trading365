// Annual SEO refresh: bump the year in article TITLES and META only.
//
// Strategy (see lib/utils/slug.ts): titles/meta carry the year for SERP CTR +
// freshness; slugs stay evergreen and are NEVER touched here. Run each January.
//
//   node scripts/bump-title-year.mjs              # dry run, previous year -> current
//   node scripts/bump-title-year.mjs --apply      # write changes
//   node scripts/bump-title-year.mjs --from 2026 --to 2027 --apply
//
// Only title, meta_title, meta_description are updated. Body content is left for
// a manual freshness pass (stats/prices), which is what actually protects rankings.
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const sql = neon(dbUrl)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const now = new Date().getFullYear()
const arg = (name, def) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? parseInt(args[i + 1]) : def }
const FROM = arg('--from', now - 1)
const TO = arg('--to', now)

if (FROM === TO) { console.error(`--from and --to are both ${FROM}; nothing to do.`); process.exit(1) }
const fromRe = new RegExp(`\\b${FROM}\\b`, 'g')

console.log(`Bumping ${FROM} -> ${TO} in title / meta_title / meta_description (${APPLY ? 'APPLY' : 'dry run'})\n`)

const rows = await sql`SELECT id, slug, title, meta_title, meta_description FROM articles ORDER BY id`
let changed = 0
for (const r of rows) {
  const nt = r.title ? r.title.replace(fromRe, TO) : r.title
  const nmt = r.meta_title ? r.meta_title.replace(fromRe, TO) : r.meta_title
  const nmd = r.meta_description ? r.meta_description.replace(fromRe, TO) : r.meta_description
  if (nt === r.title && nmt === r.meta_title && nmd === r.meta_description) continue
  changed++
  console.log(`id${r.id}  ${r.slug}`)
  if (nt !== r.title) console.log(`   title: ${r.title}\n       -> ${nt}`)
  if (nmt !== r.meta_title) console.log(`   meta_title -> ${nmt}`)
  if (APPLY) {
    await sql`UPDATE articles SET title = ${nt}, meta_title = ${nmt}, meta_description = ${nmd}, updated_at = NOW() WHERE id = ${r.id}`
  }
}
console.log(`\n${APPLY ? 'Applied to' : 'Would change'} ${changed} article(s). Slugs left untouched (evergreen).`)
console.log(`Reminder: also do a manual body freshness pass (prices/stats) on the top pages.`)
process.exit(0)
