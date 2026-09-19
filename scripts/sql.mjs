/**
 * Run a SQL statement against DATABASE_URL and print the rows as JSON.
 *
 * There is no psql on this machine and the database is Neon over HTTP, so this is
 * the only way to inspect state from the terminal. Read-only by convention: it
 * will refuse anything that is not a SELECT unless --write is passed.
 *
 *   node scripts/sql.mjs "SELECT COUNT(*) FROM signal_receipts"
 *   node scripts/sql.mjs "SELECT 1" --param 2026-09-18      (use $1 in the SQL)
 *   node scripts/sql.mjs "SELECT ..." --limit 50
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

const sqlText = process.argv[2]
if (!sqlText) {
  console.error('usage: node scripts/sql.mjs "<SELECT ...>" [--param V] [--limit N] [--write]')
  process.exit(1)
}
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const write = process.argv.includes('--write')
const limit = Number(arg('--limit') ?? 0)

if (!write && !/^\s*(select|with|show|explain)/i.test(sqlText)) {
  console.error('refusing: statement does not start with SELECT/WITH/SHOW/EXPLAIN (pass --write to override)')
  process.exit(1)
}

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = neon(process.env.DATABASE_URL)

const p = arg('--param')
const rows = await sql(sqlText, p === undefined ? [] : [p])
const out = limit > 0 ? rows.slice(0, limit) : rows
console.log(`rows: ${rows.length}`)
console.log(JSON.stringify(out, null, 2))
