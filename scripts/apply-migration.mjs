/**
 * Apply a migration file from migrations/ to the database in DATABASE_URL.
 *
 * There is no migration runner in this repo — 001/002/003 were applied by hand —
 * and the neon HTTP driver executes one statement per call, so a multi-statement
 * .sql file cannot be passed through in a single request. This splits the file on
 * statement boundaries and runs each one in order.
 *
 *   node scripts/apply-migration.mjs migrations/004_shadow_pattern_scores.sql
 *   node scripts/apply-migration.mjs 004_shadow_pattern_scores.sql --dry
 *
 * --dry prints the statements it would run and touches nothing.
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

function loadEnv() {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/apply-migration.mjs <migrations/xxx.sql> [--dry]')
  process.exit(1)
}
const dry = process.argv.includes('--dry')

const raw = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// Strip full-line comments, then split on ';'. No string literal in the migration
// files contains a semicolon, so this is safe here (asserted below).
const stripped = raw
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
const statements = stripped.split(';').map((s) => s.trim()).filter(Boolean)

if (/'.*;.*'/.test(stripped)) {
  console.error('ABORT: a quoted string contains a semicolon — naive split would corrupt it')
  process.exit(1)
}

console.log(`${file}: ${statements.length} statement(s)${dry ? ' (dry)' : ''}`)
statements.forEach((s, i) => {
  console.log(`\n--- [${i + 1}] ${s.split('\n')[0].slice(0, 90)}`)
  if (dry) console.log(s)
})

if (dry) process.exit(0)

loadEnv()
const sql = neon(process.env.DATABASE_URL)
for (const [i, s] of statements.entries()) {
  await sql(s, [])
  console.log(`ok [${i + 1}]`)
}
console.log('\nmigration applied')
