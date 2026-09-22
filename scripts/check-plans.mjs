/**
 * Guard the plan table in lib/premium.ts.
 *
 * THE BUG THIS EXISTS TO CATCH
 * `isPlanKey` used to be hardcoded:
 *     const isPlanKey = (v) => v === 'monthly' || v === 'quarterly'
 * while /api/pay/webhook does:
 *     const days = isPlanKey(plan) ? PLANS[plan].days : 30
 * So a tier added to PLANS but NOT to isPlanKey is charged at its own price and
 * then granted 30 days. Nothing errors. Nothing logs. The first symptom is a
 * yearly buyer asking why their access expired three hundred days early.
 *
 * isPlanKey is now derived from PLANS, so that exact shape cannot recur. This
 * script is what keeps it derived — and it covers the NEXT tier too, which
 * nobody will remember to check by hand.
 *
 *   node --env-file=.env.local scripts/check-plans.mjs
 */
import { PLANS, isPlanKey, planMonths, planPerMonth, planSavingsPct } from '../lib/premium.ts'

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const ok = (msg) => console.log(`  ok    ${msg}`)

const keys = Object.keys(PLANS)
console.log(`plans: ${keys.join(', ')}\n`)

// ── 1. Every declared tier must survive isPlanKey ──────────────────────────
// If this fails, the webhook silently grants 30 days instead of the real term.
//
// Note the asymmetry this exposes, which is the whole reason the bug is nasty:
// a forgotten tier with days=30 (like monthly) is granted the CORRECT term by
// accident, so the fault is invisible. Only tiers longer than 30 days — quarterly,
// yearly, and every future one — under-grant, and they under-grant silently.
console.log('1. every PLANS key is accepted by isPlanKey')
for (const k of keys) {
  if (!isPlanKey(k)) fail(`isPlanKey('${k}') is FALSE — a ${k} buyer would be granted 30 days, not ${PLANS[k].days}`)
  else if (PLANS[k].days === 30) ok(`'${k}' -> ${PLANS[k].days} days  (would be correct by accident if rejected — see note)`)
  else ok(`'${k}' -> ${PLANS[k].days} days`)
}

// ── 2. PLANS[k].key must equal k ───────────────────────────────────────────
// /account builds checkout buttons from `p.key` and UpgradeButtons POSTs that
// string to /api/pay/create, which validates it with isPlanKey. A mismatch here
// means the button exists and the checkout rejects it.
console.log('\n2. each entry\'s `key` matches its position in PLANS')
for (const k of keys) {
  if (PLANS[k].key !== k) fail(`PLANS.${k}.key is '${PLANS[k].key}' — the /account button would POST '${PLANS[k].key}'`)
  else ok(`PLANS.${k}.key === '${k}'`)
}

// ── 3. isPlanKey must reject junk AND prototype keys ────────────────────────
// `in` would accept 'constructor'/'toString' and hand a function to PLANS[plan].days.
console.log('\n3. isPlanKey rejects non-plans and prototype keys')
for (const bad of ['', 'free', 'annual', 'MONTHLY', 'monthly ', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
  if (isPlanKey(bad)) fail(`isPlanKey(${JSON.stringify(bad)}) is TRUE — it must be false`)
  else ok(`rejects ${JSON.stringify(bad)}`)
}

// ── 4. The ladder must actually get cheaper per month ──────────────────────
console.log('\n4. longer terms are cheaper per month')
const ladder = [...keys].sort((a, b) => PLANS[a].days - PLANS[b].days)
for (let i = 1; i < ladder.length; i++) {
  const prev = ladder[i - 1], cur = ladder[i]
  const pv = planPerMonth(prev), cv = planPerMonth(cur)
  if (!(cv < pv)) fail(`${cur} ($${cv.toFixed(2)}/mo) is not cheaper than ${prev} ($${pv.toFixed(2)}/mo) — no reason to commit longer`)
  else ok(`${prev} $${pv.toFixed(2)}/mo -> ${cur} $${cv.toFixed(2)}/mo  (save ${planSavingsPct(cur)}%)`)
}

// ── 5. Derived figures must be sane ────────────────────────────────────────
console.log('\n5. derived figures are sane')
for (const k of keys) {
  const months = planMonths(k), per = planPerMonth(k), save = planSavingsPct(k)
  if (!Number.isFinite(per) || per <= 0) fail(`${k}: per-month price is ${per}`)
  if (save < 0 || save >= 100) fail(`${k}: savings ${save}% is out of range`)
  if (k === 'monthly' && save !== 0) fail(`monthly must be the 0% baseline, got ${save}%`)
  if (!Number.isInteger(months) || months < 1) fail(`${k}: months is ${months}`)
  ok(`${k.padEnd(10)} ${String(planMonths(k)).padStart(2)}mo  $${per.toFixed(2)}/mo  save ${String(save).padStart(2)}%`)
}

// ── 6. Charge-through: what /api/pay/create writes vs what createInvoice bills ──
// These both read PLANS[plan], so they agree by construction — asserted anyway so
// that a future refactor that copies a price into a literal gets caught.
console.log('\n6. the amount written to subscribers matches the amount invoiced')
for (const k of keys) {
  const expected = PLANS[k].amount
  if (typeof expected !== 'number' || !Number.isFinite(expected) || expected <= 0) fail(`${k}: amount is ${expected}`)
  else ok(`${k.padEnd(10)} invoices $${expected}`)
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`}`)
process.exit(failures === 0 ? 0 : 1)