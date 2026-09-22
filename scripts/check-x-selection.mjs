/**
 * Guard the X post-selection policy in lib/x.ts.
 *
 * THE BUG THIS EXISTS TO CATCH
 * `choosePosts` used to sort by `abs_move`, and for a TP hit `move_pct` records the
 * TARGET distance rather than the move achieved — so every TP5 of a busy day is
 * exactly 8.0 and the sort was a 30-way tie. The tie was broken by recency, and
 * because a signal that closed later is one that took LONGER, the account
 * systematically published its SLOWEST wins. On 2026-09-21 it posted two +8%
 * signals that had taken 31.2 and 27.9 hours, while the same day held one that did
 * +8% in 1.4 hours.
 *
 * Nothing caught it, because a plausible-looking post still came out. These
 * assertions are what make the next silent regression loud.
 *
 *   node --env-file=.env.local scripts/check-x-selection.mjs
 */
import { choosePosts } from '../lib/x.ts'

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const ok = (msg) => console.log(`  ok    ${msg}`)
const eq = (actual, expected, what) =>
  actual === expected ? ok(`${what} = ${expected}`) : fail(`${what}: expected ${expected}, got ${actual}`)

const c = (id, status, absMove, mfe, hours) => ({
  public_id: id, status, abs_move: absMove, mfe_pct: mfe, hours_to_close: hours,
})

// A realistic busy day, modelled on 2026-09-21: 30 TP5s that all tie at 8.0,
// 4 TP4s, 2 TP3s, 4 TP2s, 2 TP1s, 7 stops. The three that matter:
//   UAI   — +8% in 1.4h  (the fastest big win, and the one the old code ignored)
//   CRV   — +8% in 31.2h (the slowest, which the old code actually picked)
//   PENGU — +8%, peak 10.59 (the highest excursion)
const day = [
  c('uai', 'tp5', 8.0, 10.39, 1.40),
  c('pengu', 'tp5', 8.0, 10.59, 28.65),
  c('people', 'tp5', 8.0, 9.76, 28.15),
  c('chip', 'tp5', 8.0, 9.53, 12.15),
  c('link', 'tp5', 8.0, 9.37, 25.40),
  c('xlm', 'tp5', 8.0, 9.33, 26.40),
  c('dash', 'tp5', 8.0, 9.11, 21.15),
  c('crv', 'tp5', 8.0, 8.15, 31.15),
  c('xrp', 'tp5', 8.0, 8.26, 27.90),
  c('okb', 'tp5', 8.0, 8.40, 30.10),
  c('tp4a', 'tp4', 6.0, 7.20, 9.00),
  c('tp3a', 'tp3', 4.0, 5.10, 3.00),
  c('tp2a', 'tp2', 2.5, 3.40, 2.00),
  c('tp1a', 'tp1', 1.5, 2.10, 0.50),
  c('ake', 'sl', 4.0, 1.00, 6.00),
  c('g', 'sl', 4.0, 0.50, 5.00),
  c('prom', 'sl', 2.86, 0.80, 4.00),
  c('jst', 'sl', 2.24, 0.30, 3.00),
  c('pendle', 'sl', 2.00, 0.20, 2.00),
]

const pick = (n) => choosePosts(day, n)

// ── 1. The three slots, in order ────────────────────────────────────────────
console.log('1. three slots: biggest loss, fastest big win, highest peak')
const three = pick(3)
eq(three.length, 3, 'slots filled')
eq(three[0]?.public_id, 'ake', 'slot 1 (biggest loss, -4.00)')
eq(three[1]?.public_id, 'uai', 'slot 2 (fastest big win, 1.4h)')
eq(three[2]?.public_id, 'pengu', 'slot 3 (highest peak, 10.59)')

// ── 2. The regression: never prefer a slow grind over a fast move ───────────
console.log('\n2. the 2026-09-21 regression — speed must beat recency')
const ids = three.map((p) => p.public_id)
if (ids.includes('crv')) fail('picked CRV (+8% in 31.2h) — the slow grind the old code chose')
else ok('did not pick CRV (+8% in 31.2h)')
if (ids.includes('uai')) ok('picked UAI (+8% in 1.4h) — the fast one')
else fail('missed UAI (+8% in 1.4h)')

// ── 3. abs_move alone cannot discriminate two winners ───────────────────────
console.log('\n3. a 30-way tie at 8.0 must not fall back to input order')
const reversed = choosePosts([...day].reverse(), 3).map((p) => p.public_id)
if (JSON.stringify(reversed) === JSON.stringify(ids)) ok('same three regardless of input order')
else fail(`input order changed the result: ${ids.join(',')} vs ${reversed.join(',')}`)

// ── 4. No duplicates, ever ──────────────────────────────────────────────────
console.log('\n4. never returns the same receipt twice')
for (const n of [1, 2, 3, 5, 10, 19]) {
  const got = pick(n).map((p) => p.public_id)
  if (new Set(got).size !== got.length) fail(`limit=${n} returned a duplicate: ${got.join(',')}`)
  else if (got.length !== Math.min(n, day.length)) fail(`limit=${n} returned ${got.length}`)
  else ok(`limit=${n} -> ${got.length} unique`)
}

// ── 5. A single slot posts a WIN, not a loss ────────────────────────────────
console.log('\n5. one slot posts the most notable win, never a lone loss')
const one = pick(1)
eq(one.length, 1, 'slots filled')
if (one[0]?.status === 'sl') fail('posted a loss in a single-slot day — arbitrary, not honest')
else ok(`posted ${one[0]?.public_id} (${one[0]?.status})`)

// ── 6. Degenerate days must not crash or return junk ────────────────────────
console.log('\n6. degenerate inputs')
eq(choosePosts([], 3).length, 0, 'empty pool')
eq(choosePosts(day, 0).length, 0, 'limit 0')
const lossesOnly = day.filter((p) => p.status === 'sl')
eq(choosePosts(lossesOnly, 3).length, 3, 'losses-only day still posts 3')
const noTp4 = day.filter((p) => p.status !== 'tp5' && p.status !== 'tp4')
eq(choosePosts(noTp4, 3).length, 3, 'day with no TP4/TP5 still posts 3 (falls back to any win)')

// ── 7. Missing metrics must not make the sort arbitrary ─────────────────────
console.log('\n7. null mfe / null hours_to_close')
const nulls = [
  c('n1', 'tp5', 8.0, null, null),
  c('n2', 'tp5', 8.0, 9.0, 5.0),
  c('n3', 'sl', 4.0, null, null),
  c('n4', 'tp5', 8.0, 7.0, null),
]
const got = choosePosts(nulls, 3).map((p) => p.public_id)
if (new Set(got).size !== got.length) fail(`duplicate with nulls: ${got.join(',')}`)
else ok(`no duplicates with nulls: ${got.join(',')}`)
if (!got.includes('n2')) fail('a real peak (9.0) lost to a null peak — nulls must rank last')
else ok('real peak outranks null peak')
// Two nulls compared with each other must not produce NaN and scramble the order.
const allNull = [c('a', 'tp5', 8.0, null, null), c('b', 'tp5', 8.0, null, null)]
eq(choosePosts(allNull, 2).length, 2, 'all-null peaks still return 2 (no NaN sort)')

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}`)
process.exit(failures === 0 ? 0 : 1)