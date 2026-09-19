/**
 * Report the state of the shadow pattern store.
 *
 * Used to verify migration 004 (table + expected columns) and to prove the scorer
 * is idempotent per (candidate_id, pattern_version). Read-only.
 *
 *   node scripts/shadow-status.mjs
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = neon(process.env.DATABASE_URL)

const [reg] = await sql`SELECT to_regclass('public.shadow_pattern_scores')::text AS t`
if (!reg?.t) {
  console.log('shadow_pattern_scores: DOES NOT EXIST')
  process.exit(0)
}
console.log('shadow_pattern_scores: exists')

const cols = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'shadow_pattern_scores'
  ORDER BY ordinal_position`
console.log(`columns: ${cols.length}`)
console.log(cols.map((c) => `  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`).join('\n'))

const idx = await sql`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'shadow_pattern_scores'
  ORDER BY indexname`
console.log('\nindexes:')
console.log(idx.map((i) => `  ${i.indexname}`).join('\n') || '  (none)')

const [n] = await sql`SELECT COUNT(*)::int AS n FROM shadow_pattern_scores`
console.log(`\nrows: ${n.n}`)

if (n.n > 0) {
  const byVer = await sql`
    SELECT pattern_version, COUNT(*)::int AS n, MIN(scanned_at)::text AS oldest,
           MAX(scanned_at)::text AS newest
    FROM shadow_pattern_scores GROUP BY pattern_version ORDER BY n DESC`
  console.log('by pattern_version:')
  console.log(byVer.map((r) => `  ${r.pattern_version}: ${r.n} rows (scanned ${r.oldest} .. ${r.newest})`).join('\n'))

  const dupes = await sql`
    SELECT candidate_id, pattern_version, COUNT(*)::int AS n
    FROM shadow_pattern_scores
    GROUP BY candidate_id, pattern_version HAVING COUNT(*) > 1 LIMIT 5`
  console.log(`duplicate (candidate_id, pattern_version) pairs: ${dupes.length === 0 ? 'NONE — idempotent' : dupes.length}`)

  const [nulls] = await sql`
    SELECT COUNT(*) FILTER (WHERE bars_4h_available IS NULL)::int AS no4h,
           COUNT(*) FILTER (WHERE bars_1d_available IS NULL)::int AS no1d
    FROM shadow_pattern_scores`
  console.log(`rows missing bar counts: 4h=${nulls.no4h} 1d=${nulls.no1d}`)

  const sample = await sql`
    SELECT candidate_id, symbol, exchange, direction, score, scanned_at::text AS scanned_at,
           a_squeeze, b_aligned, c_aligned, d_extreme, bars_4h_available, bars_1d_available
    FROM shadow_pattern_scores ORDER BY computed_at DESC LIMIT 5`
  console.log('\nnewest 5:')
  console.log(JSON.stringify(sample, null, 2))
}
