/**
 * Logical snapshot of the scanner tables, written as CSV + MANIFEST.json.
 *
 * WHY NOT pg_dump: this machine has neither pg_dump nor psql on PATH, and the
 * database is Neon over HTTP, so there is no local socket to dump from. The
 * previous migration round (2026-09-18) used exactly this method — the CSV set in
 * analysis/backup-2026-09-18/ was produced by paging the tables through the neon
 * driver — so this script reproduces it rather than inventing a new scheme.
 *
 * Paged with OFFSET/LIMIT because not every table here has an `id` column
 * (scanner_outcomes does not), so keyset paging is not available generically.
 *
 *   node scripts/backup-db.mjs                    -> analysis/backup-<today>/
 *   node scripts/backup-db.mjs --dir <path>       -> explicit output directory
 *   node scripts/backup-db.mjs --tables a,b,c     -> subset (default: the 5 below)
 *
 * Read-only. Issues nothing but SELECTs.
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const DEFAULT_TABLES = [
  'telegram_alerts',
  'telegram_alerts_long',
  'signal_receipts',
  'scanner_signals',
  'scanner_outcomes',
]
const PAGE = 5000

function loadEnv() {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** RFC4180: quote every field, double any embedded quote. */
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

loadEnv()
const sql = neon(process.env.DATABASE_URL)

const outDir = arg('--dir', `analysis/backup-${new Date().toISOString().slice(0, 10)}`)
const tables = arg('--tables', '') ? arg('--tables').split(',') : DEFAULT_TABLES

mkdirSync(new URL(`../${outDir}/`, import.meta.url), { recursive: true })

const manifest = { taken_at: new Date().toISOString(), method: 'neon-paged-csv', tables: {} }

for (const table of tables) {
  const [meta] = await sql(
    `SELECT COUNT(*)::int AS rows FROM ${table}`, [])
  const cols = await sql(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`, [table])
  const names = cols.map((c) => c.column_name)

  const lines = [names.map(csvCell).join(',')]
  for (let off = 0; off < meta.rows; off += PAGE) {
    const rows = await sql(`SELECT * FROM ${table} OFFSET ${off} LIMIT ${PAGE}`, [])
    for (const r of rows) lines.push(names.map((n) => csvCell(r[n])).join(','))
    process.stdout.write(`  ${table}: ${Math.min(off + PAGE, meta.rows)}/${meta.rows}\r`)
  }
  writeFileSync(new URL(`../${outDir}/${table}.csv`, import.meta.url), lines.join('\n'), 'utf8')
  manifest.tables[table] = { rows: meta.rows, columns: names.length }
  console.log(`\n  wrote ${table}.csv — ${meta.rows} rows, ${names.length} columns`)
}

writeFileSync(new URL(`../${outDir}/MANIFEST.json`, import.meta.url),
  JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log(`\nmanifest: ${outDir}/MANIFEST.json`)
console.log(JSON.stringify(manifest, null, 2))
