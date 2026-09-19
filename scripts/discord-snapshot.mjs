/**
 * Renders the Discord daily-snapshot embed for a UTC day from REAL data, then
 * asserts the things that would make it either a lie or a failed request.
 *
 *   node scripts/discord-snapshot.mjs --dry --date 2026-09-18
 *   node scripts/discord-snapshot.mjs --dry                    (yesterday UTC)
 *   node scripts/discord-snapshot.mjs --post --date 2026-09-18 (actually sends)
 *
 * ASSERTED:
 *   1. wins + stopped + expired + open === fired  (the counts add up)
 *   2. `fired` agrees with an independent COUNT(*) over the same day
 *   3. hit rate and net average agree with the /signals archive header's own
 *      arithmetic, recomputed independently in SQL over the same rows
 *   4. every field is inside Discord's embed limits
 *
 * The embed itself is built by lib/discord-snapshot.ts — the SAME function the
 * cron route uses — so this preview cannot show something the live post would not.
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

// Env must be loaded BEFORE the library modules, because those construct their
// neon clients at module load. Hence the dynamic imports below, not static ones.
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

// The FORMAT module is imported by path (node needs the explicit '.ts'
// extension); it is import-free at runtime by design, so node can load it. The
// I/O module (lib/discord-snapshot.ts) uses '@/' aliases and therefore cannot be
// imported here — its behaviour is exercised through the deployed route by --post.
const { buildSnapshotEmbed, EMBED_LIMITS } =
  await import('../lib/discord-snapshot-format.ts')
const { getArchiveStatsForDay, getDayBest, SITE } = await import('../lib/signals/public.ts')

/** Same computation as previousUtcDay() in lib/discord-snapshot.ts. */
const previousUtcDay = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const dry = process.argv.includes('--dry')
const wantPost = process.argv.includes('--post')

const dateArg = arg('--date')
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error(`--date must be YYYY-MM-DD, got: ${dateArg}`)
  process.exit(1)
}
const day = dateArg ?? previousUtcDay()
console.log(`day: ${day}${dateArg ? '' : ' (yesterday UTC, the cron default)'}`)

const sql = neon(process.env.DATABASE_URL)

const [stats, best] = await Promise.all([getArchiveStatsForDay(day), getDayBest(day)])

const embed = buildSnapshotEmbed(day, stats, best, SITE)
console.log('\n════ EMBED JSON ════')
console.log(JSON.stringify(embed, null, 2))

// ── Independent recomputation over the same rows ────────────────────────────
const [raw] = await sql`
  SELECT
    COUNT(*)::int AS fired,
    COUNT(*) FILTER (WHERE status LIKE 'tp%')::int AS wins,
    COUNT(*) FILTER (WHERE status = 'sl')::int AS losses,
    COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
    COUNT(*) FILTER (WHERE status = 'fired')::int AS open,
    COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS resolved,
    COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND status LIKE 'tp%')::int AS resolved_wins,
    COALESCE(AVG(COALESCE(net_move_pct, move_pct - ${stats.netRoundTripPct}))
      FILTER (WHERE closed_at IS NOT NULL), 0)::float AS avg_net
  FROM signal_receipts
  WHERE date_trunc('day', fired_at AT TIME ZONE 'UTC') = ${day}::date
`

console.log('\n════ INDEPENDENT SQL RECOMPUTATION ════')
console.log(JSON.stringify(raw, null, 2))

// ── Assertions ──────────────────────────────────────────────────────────────
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`) }
  else console.log(`  ok   ${label} ${detail}`)
}

console.log('\n════ ASSERTIONS ════')

// 1 + 2 — the counts add up, and `fired` matches an independent count.
const sum = stats.wins + stats.losses + stats.expired + stats.open
check('TP + stopped + expired + open === fired', sum === stats.fired,
  `(${stats.wins}+${stats.losses}+${stats.expired}+${stats.open}=${sum} vs ${stats.fired})`)
check('stats.fired === independent COUNT(*)', stats.fired === raw.fired,
  `(${stats.fired} vs ${raw.fired})`)
check('independent counts also balance',
  raw.wins + raw.losses + raw.expired + raw.open === raw.fired,
  `(${raw.wins}+${raw.losses}+${raw.expired}+${raw.open}=${raw.wins + raw.losses + raw.expired + raw.open} vs ${raw.fired})`)
check('per-side fired sums to fired',
  stats.firedBySide.long + stats.firedBySide.short === stats.fired,
  `(${stats.firedBySide.long} long + ${stats.firedBySide.short} short)`)

// 3 — the archive header's arithmetic, recomputed independently in SQL.
const rawHit = raw.resolved > 0 ? (raw.resolved_wins / raw.resolved) * 100 : null
check('hit rate matches archive arithmetic',
  (stats.hitRate == null && rawHit == null) ||
    Math.abs((stats.hitRate ?? 0) - (rawHit ?? 0)) < 1e-9,
  `(${stats.hitRate} vs ${rawHit})`)
check('net avg matches archive arithmetic',
  Math.abs((stats.netExpectancy ?? 0) - raw.avg_net) < 1e-9,
  `(${stats.netExpectancy} vs ${raw.avg_net})`)

// 4 — Discord's embed limits.
let total = String(embed.title ?? '').length
for (const f of embed.fields ?? []) total += f.name.length + f.value.length
total += String(embed.footer?.text ?? '').length
check('title within limit', String(embed.title).length <= EMBED_LIMITS.title,
  `(${String(embed.title).length}/${EMBED_LIMITS.title})`)
for (const f of embed.fields ?? []) {
  check(`field "${f.name}" within limits`,
    f.name.length <= EMBED_LIMITS.fieldName && f.value.length <= EMBED_LIMITS.fieldValue,
    `(name ${f.name.length}, value ${f.value.length})`)
}
check('footer within limit', String(embed.footer?.text ?? '').length <= EMBED_LIMITS.footer)
check('total embed length within limit', total <= EMBED_LIMITS.total, `(${total}/${EMBED_LIMITS.total})`)

// The zero-signal path is an explicit requirement, so render it once.
const zero = buildSnapshotEmbed(day, { ...stats, fired: 0, firedBySide: { long: 0, short: 0 } }, null, SITE)
check('zero-signal day still renders a post',
  String(zero.description ?? '').includes('No signals cleared the bar today'))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

if (wantPost) {
  console.log('\n════ LIVE POST (via the deployed cron route) ════')
  // The route IS the cron path, so this exercises exactly what the scheduler will
  // do — auth, the idempotency guard, the webhook call and its response.
  const url = `https://trading365.org/api/scanner/discord-snapshot?cron=true&date=${day}`
  try {
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    console.log(`status: ${r.status}`)
    console.log(await r.text())
    if (!r.ok) failures++
  } catch (e) {
    console.log(`request failed: ${e.message}`)
    failures++
  }
}

process.exitCode = failures === 0 ? 0 : 1
