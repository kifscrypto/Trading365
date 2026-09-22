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

// Fixed random so the loss pick is assertable. Randomness itself is tested in §2.
const R0 = { random: () => 0 }
const pick = (n, opts = R0) => choosePosts(day, n, opts)

// ── 1. The three slots, in order ────────────────────────────────────────────
console.log('1. three slots: a loss, the fastest big win, the highest peak')
const three = pick(3)
eq(three.length, 3, 'slots filled')
eq(three[0]?.status, 'sl', 'slot 1 is a loss')
eq(three[1]?.public_id, 'uai', 'slot 2 (fastest big win, 1.4h)')
eq(three[2]?.public_id, 'pengu', 'slot 3 (highest peak, 10.59)')

// ── 2. The loss is RANDOM, not the biggest ──────────────────────────────────
console.log('\n2. the loss is drawn at random, not the worst of the day')
const draws = [0, 0.25, 0.5, 0.75, 0.999].map((r) => pick(3, { random: () => r })[0])
if (draws.some((d) => d.status !== 'sl')) fail('a draw returned a non-loss')
else ok(`all 5 draws returned a loss (${draws.map((d) => d.public_id).join(', ')})`)
const distinct = new Set(draws.map((d) => d.public_id))
if (distinct.size < 3) fail(`only ${distinct.size} distinct losses across 5 draws — not random`)
else ok(`${distinct.size} distinct losses across 5 draws`)
const nonBiggest = draws.filter((d) => d.abs_move < 4.0).length
if (nonBiggest === 0) fail('every draw returned the biggest loss — that is not random')
else ok(`${nonBiggest}/5 draws avoided the biggest loss`)
const edge = pick(3, { random: () => 1 })[0]
if (!edge || edge.status !== 'sl') fail('random()=1 fell off the end of the losses array')
else ok(`random()=1 clamps to ${edge.public_id}`)

// ── 3. The regression: never prefer a slow grind over a fast move ───────────
console.log('\n3. the 2026-09-21 regression — speed must beat recency')
const ids = three.map((p) => p.public_id)
if (ids.includes('crv')) fail('picked CRV (+8% in 31.2h) — the slow grind the old code chose')
else ok('did not pick CRV (+8% in 31.2h)')
if (ids.includes('uai')) ok('picked UAI (+8% in 1.4h) — the fast one')
else fail('missed UAI (+8% in 1.4h)')

// ── 4. abs_move alone cannot discriminate two winners ───────────────────────
console.log('\n4. a 30-way tie at 8.0 must not fall back to input order')
const reversed = choosePosts([...day].reverse(), 3, R0).map((p) => p.public_id)
if (JSON.stringify(reversed) === JSON.stringify(ids)) ok('same three regardless of input order')
else fail(`input order changed the result: ${ids.join(',')} vs ${reversed.join(',')}`)

// ── 5. No duplicates, ever ──────────────────────────────────────────────────
console.log('\n5. never returns the same receipt twice')
for (const n of [1, 2, 3, 5, 10, 19]) {
  const got = pick(n).map((p) => p.public_id)
  if (new Set(got).size !== got.length) fail(`limit=${n} returned a duplicate: ${got.join(',')}`)
  else if (got.length !== Math.min(n, day.length)) fail(`limit=${n} returned ${got.length}`)
  else ok(`limit=${n} -> ${got.length} unique`)
}

// ── 6. A single slot posts a WIN, not a loss ────────────────────────────────
console.log('\n6. one slot posts the most notable win, never a lone loss')
const one = pick(1)
eq(one.length, 1, 'slots filled')
if (one[0]?.status === 'sl') fail('posted a loss in a single-slot day — arbitrary, not honest')
else ok(`posted ${one[0]?.public_id} (${one[0]?.status})`)

// ── 7. THE DAY COMPOSITION ──────────────────────────────────────────────────
// A 3-cap day spread across three runs, one post each, with the pool shrinking as
// receipts are marked posted. needLoss must flip once the loss goes out, or slot 1
// refills with a DIFFERENT loss every run and the day publishes loss, loss, win —
// which is exactly what the first cut of this policy did.
console.log('\n7. a 3-cap day spread over 3 runs publishes exactly ONE loss')
let pool = [...day]
let needLoss = true
const postedIds = []
for (let run = 1; run <= 3; run++) {
  const batch = choosePosts(pool, 3 - postedIds.length, { needLoss, random: () => run * 0.1 })
  const first = batch[0]
  postedIds.push(first.public_id)
  pool = pool.filter((p) => p.public_id !== first.public_id)
  if (first.status === 'sl') needLoss = false
}
const lossCount = postedIds.filter((id) => day.find((d) => d.public_id === id)?.status === 'sl').length
eq(lossCount, 1, `losses across the day (posted: ${postedIds.join(', ')})`)

// ── 8. Degenerate days must not crash or return junk ────────────────────────
console.log('\n8. degenerate inputs')
eq(choosePosts([], 3, R0).length, 0, 'empty pool')
eq(choosePosts(day, 0, R0).length, 0, 'limit 0')
const lossesOnly = day.filter((p) => p.status === 'sl')
eq(choosePosts(lossesOnly, 3, R0).length, 3, 'losses-only day still posts 3')
const noTp4 = day.filter((p) => p.status !== 'tp5' && p.status !== 'tp4')
eq(choosePosts(noTp4, 3, R0).length, 3, 'day with no TP4/TP5 still posts 3 (falls back to any win)')
eq(choosePosts(day, 3, { needLoss: false, random: () => 0 })[0]?.status !== 'sl', true, 'needLoss:false posts no loss')

// ── 9. Missing metrics must not make the sort arbitrary ─────────────────────
console.log('\n9. null mfe / null hours_to_close')
const nulls = [
  c('n1', 'tp5', 8.0, null, null),
  c('n2', 'tp5', 8.0, 9.0, 5.0),
  c('n3', 'sl', 4.0, null, null),
  c('n4', 'tp5', 8.0, 7.0, null),
]
const got = choosePosts(nulls, 3, R0).map((p) => p.public_id)
if (new Set(got).size !== got.length) fail(`duplicate with nulls: ${got.join(',')}`)
else ok(`no duplicates with nulls: ${got.join(',')}`)
if (!got.includes('n2')) fail('a real peak (9.0) lost to a null peak — nulls must rank last')
else ok('real peak outranks null peak')
// Two nulls compared with each other must not produce NaN and scramble the order.
const allNull = [c('a', 'tp5', 8.0, null, null), c('b', 'tp5', 8.0, null, null)]
eq(choosePosts(allNull, 2, R0).length, 2, 'all-null peaks still return 2 (no NaN sort)')

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}`)
process.exit(failures === 0 ? 0 : 1)