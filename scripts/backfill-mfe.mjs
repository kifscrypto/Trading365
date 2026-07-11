/**
 * Backfill mfe_pct (max favourable excursion) for resolved scanner alerts.
 *
 * For each alert we fetch OKX 1H candles covering [triggered_at, closed_at] and
 * compute the peak favourable move: short → (entry − lowest low)/entry, long →
 * (highest high − entry)/entry. Symbols not listed on OKX are skipped (left NULL);
 * the live monitors populate those going forward.
 *
 *   node --env-file=.env.local scripts/backfill-mfe.mjs            # dry run (coverage report)
 *   node --env-file=.env.local scripts/backfill-mfe.mjs --apply    # write mfe_pct
 */
import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function okxWindow(base, fromMs, toMs) {
  const instId = `${base}-USDT-SWAP`
  // `after` MUST be an integer ms — a fractional value (EXTRACT(EPOCH)*1000 can
  // carry decimals) makes OKX return code 51000 (parameter error).
  const after = Math.floor(toMs) + 3600000
  const url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1H&after=${after}&limit=100`
  let data = []
  try {
    data = (await (await fetch(url)).json()).data ?? []
    if (!data.length) data = (await (await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=100`)).json()).data ?? []
  } catch { return null }
  const inWin = data.map(c => ({ ts: +c[0], h: +c[2], l: +c[3] })).filter(c => c.ts >= fromMs && c.ts <= toMs)
  return inWin.length ? inWin : null
}

const rowsShort = () => sql`
  SELECT id, symbol, entry_price::float entry,
         EXTRACT(EPOCH FROM triggered_at)*1000 t0,
         EXTRACT(EPOCH FROM CASE WHEN closed_at > triggered_at + INTERVAL '1 hour'
                                 THEN closed_at ELSE triggered_at + INTERVAL '48 hours' END)*1000 t1
  FROM telegram_alerts
  WHERE tp_result IS NOT NULL AND mfe_pct IS NULL AND triggered_at > NOW() - INTERVAL '30 days' AND entry_price > 0
  ORDER BY triggered_at DESC`
const rowsLong = () => sql`
  SELECT id, symbol, entry_price::float entry,
         EXTRACT(EPOCH FROM triggered_at)*1000 t0,
         EXTRACT(EPOCH FROM CASE WHEN closed_at > triggered_at + INTERVAL '1 hour'
                                 THEN closed_at ELSE triggered_at + INTERVAL '48 hours' END)*1000 t1
  FROM telegram_alerts_long
  WHERE tp_result IS NOT NULL AND mfe_pct IS NULL AND triggered_at > NOW() - INTERVAL '30 days' AND entry_price > 0
  ORDER BY triggered_at DESC`
const updShort = (id, mfe) => sql`UPDATE telegram_alerts      SET mfe_pct = GREATEST(COALESCE(mfe_pct,0), ${mfe}) WHERE id = ${id}`
const updLong  = (id, mfe) => sql`UPDATE telegram_alerts_long SET mfe_pct = GREATEST(COALESCE(mfe_pct,0), ${mfe}) WHERE id = ${id}`

async function backfill(label, dir, getRows, upd) {
  const rows = await getRows()
  console.log(`\n${label}: ${rows.length} rows need mfe_pct`)
  let done = 0, skip = 0
  const wins = []
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5)
    await Promise.all(batch.map(async a => {
      const base = a.symbol.replace(/USDT$/, '')
      const win = await okxWindow(base, Number(a.t0), Number(a.t1))
      if (!win) { skip++; return }
      const mfe = dir === 'short'
        ? Math.max(0, (a.entry - Math.min(...win.map(c => c.l))) / a.entry * 100)
        : Math.max(0, (Math.max(...win.map(c => c.h)) - a.entry) / a.entry * 100)
      wins.push(mfe)
      if (APPLY) await upd(a.id, mfe)
      done++
    }))
    await sleep(350)
    process.stdout.write(`  ...${Math.min(i + 5, rows.length)}/${rows.length}\r`)
  }
  const avg = wins.length ? wins.reduce((s, x) => s + x, 0) / wins.length : 0
  console.log(`\n  ${label}: computed ${done}, skipped(no OKX data) ${skip}, avg peak move ${avg.toFixed(2)}%`)
}

await backfill('telegram_alerts (short)', 'short', rowsShort, updShort)
await backfill('telegram_alerts_long (long)', 'long', rowsLong, updLong)
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — re-run with --apply to write.`)
