/**
 * Remove the regime-whipsaw shorts that the new 4H EMA50 deadband (1%) would no
 * longer fire, so historical stats/P&L reflect the fixed scanner. Applies the
 * SAME rule uniformly: a short is "whipsaw" if, at its signal time, BTC was
 * within ±1% of its 4H EMA50 (chop, not a genuine downtrend).
 *
 * Scope is limited to the 4H kline coverage window (~Jun 8 2026 onward); older
 * rows can't be classified and are left untouched.
 *
 * Backs up every row it will delete to scripts/_whipsaw-backup-<stamp>.json BEFORE
 * deleting. Dry run by default; pass --apply to delete.
 *
 *   node --env-file=.env.local scripts/delete-whipsaw-shorts.mjs           # dry run + backup
 *   node --env-file=.env.local scripts/delete-whipsaw-shorts.mjs --apply   # delete
 */
import { neon } from '@neondatabase/serverless'
import { writeFileSync } from 'node:fs'

const DRY_RUN = !process.argv.includes('--apply')
const DEADBAND = 0.01
const sql = neon(process.env.DATABASE_URL)

function calcEMA(v, p) { const k = 2/(p+1); let e = v[0]; const o = [e]; for (let i=1;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e)} return o }
const r = await fetch('https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=4H&limit=200')
const kl = (await r.json()).data.map(c => ({ ts:+c[0], c:+c[4] })).reverse()
const e50 = calcEMA(kl.map(x=>x.c), 50)
const bars = kl.map((x,i) => ({ ts:x.ts, dist:((x.c-e50[i])/e50[i])*100 }))
const COVERAGE_START = bars[0].ts
function distAt(ts) { let b=null; for (const x of bars){ if (x.ts<=ts) b=x; else break } return b?b.dist:null }
// whipsaw = has coverage AND BTC not more than DEADBAND below its 4H EMA50
function isWhipsaw(ts) { const d = distAt(new Date(ts).getTime()); return d !== null && d > -DEADBAND*100 }

// FIRED shorts
const fired = await sql`SELECT * FROM telegram_alerts ORDER BY triggered_at`
const firedKill = fired.filter(s => isWhipsaw(s.triggered_at))

// CANDIDATE shorts (only the P&L/stats-relevant set: downtrend, score>=7)
const cand = await sql`SELECT * FROM scanner_signals WHERE direction='short' AND market_condition='downtrend' AND score>=7`
const candKill = cand.filter(s => isWhipsaw(s.scanned_at))
const candIds = candKill.map(s => s.id)
const outcomes = candIds.length
  ? await sql`SELECT * FROM scanner_outcomes WHERE signal_id = ANY(${candIds})`
  : []

const stamp = kl[kl.length-1].ts // deterministic (latest candle ts), no Date.now()
const backupPath = `scripts/_whipsaw-backup-${stamp}.json`
writeFileSync(backupPath, JSON.stringify({ firedKill, candKill, outcomes }, null, 2))

const rate = a => { const w=a.filter(s=>s.tp_result?.startsWith('TP')).length, sl=a.filter(s=>s.tp_result==='SL').length; return (w+sl)?`${w}W/${sl}SL ${(100*w/(w+sl)).toFixed(0)}%`:'unresolved' }
console.log(`4H coverage from: ${new Date(COVERAGE_START).toISOString()}  deadband ${DEADBAND*100}%`)
console.log(`backup written: ${backupPath}\n`)
console.log(`telegram_alerts to delete: ${firedKill.length}  (${rate(firedKill)})`)
console.log(`scanner_signals to delete: ${candKill.length}  + ${outcomes.length} scanner_outcomes rows`)

if (DRY_RUN) { console.log('\nDRY RUN — re-run with --apply to delete.'); process.exit(0) }

// APPLY — children first (FKs), then parents. scanner_pnl is fully rebuilt after.
await sql`DELETE FROM scanner_pnl`
if (candIds.length) await sql`DELETE FROM scanner_outcomes WHERE signal_id = ANY(${candIds})`
if (candIds.length) await sql`DELETE FROM scanner_signals WHERE id = ANY(${candIds})`
const firedIds = firedKill.map(s => s.id)
if (firedIds.length) await sql`DELETE FROM telegram_alerts WHERE id = ANY(${firedIds})`
console.log(`\nDELETED ${firedIds.length} fired + ${candIds.length} candidates + ${outcomes.length} outcomes.`)
console.log('scanner_pnl cleared — run the P&L rebuild next to repopulate.')
