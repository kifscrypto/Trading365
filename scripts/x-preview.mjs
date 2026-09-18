/**
 * Renders EVERY posting shape — Telegram and X — offline, no database, no network.
 * Asserts the three things that would silently break a post:
 *   1. X shapes fit 280, counted the way X counts it (URL = 23 chars).
 *   2. Telegram text has no <, > or & — the routes send with parse_mode 'HTML',
 *      so one of those turns the whole message into a 400.
 *   3. No shape promises a return.
 *
 *   node scripts/x-preview.mjs              synthetic shapes (deterministic)
 *   node scripts/x-preview.mjs --live       also render real recent receipts
 *   node scripts/x-preview.mjs --compare    OLD vs NEW for the latest real signals
 *   node scripts/x-preview.mjs --all        everything
 */
import {
  buildFiredTelegram, buildOutcomeTelegram, buildXTweet, buildWeeklyDigestTweet,
  isTelegramHtmlSafe, tierPct,
} from '../lib/signal-messages.ts'
import { buildDigestTweet, maxPostsPerDay, postingMode, tweetLength } from '../lib/x.ts'

const LIMIT = 280
const URL = 'https://trading365.org/signals/btw-short-20260912-a1b2c3'
let failures = 0

function show(label, text) {
  console.log(`\n════ ${label} ════`)
  console.log(text)
  console.log('────')
}
function check(label, ok, detail = '') {
  if (!ok) { failures++; console.log(`  X FAIL ${label} ${detail}`) }
  else console.log(`  ok ${label} ${detail}`)
}

const shortTiers = [
  { label: 'TP1', price: '0.6929', pct: '-1.5%' },
  { label: 'TP2', price: '0.6853', pct: '-2.5%' },
  { label: 'TP3', price: '0.6748', pct: '-4.0%' },
]
const longTiers = [
  { label: 'TP1', price: '118420.50', pct: '+1.5%' },
  { label: 'TP2', price: '119587.23', pct: '+2.5%' },
  { label: 'TP3', price: '121337.08', pct: '+4.0%' },
  { label: 'TP4', price: '123670.32', pct: '+6.0%' },
  { label: 'TP5', price: '126002.87', pct: '+8.0%' },
]

const FIRED = [
  ['Telegram · FIRED short (3 tiers)', buildFiredTelegram({ side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', tiers: shortTiers, stop: '0.7284', receiptUrl: URL })],
  ['Telegram · FIRED long (5 tiers)', buildFiredTelegram({ side: 'long', pair: 'SKHYNIX', timeframe: '4H', exchange: 'BITUNIX', entry: '118420.50', tiers: longTiers, stop: '113683.68', receiptUrl: 'https://trading365.org/signals/skhnx-long-20260918-0915' })],
  ['Telegram · FIRED, no receipt yet', buildFiredTelegram({ side: 'short', pair: 'EDGE', timeframe: '4H', exchange: 'OKX', entry: '1.2345', tiers: shortTiers, stop: '1.2612', receiptUrl: null })],
]

const OUTCOME = [
  ['Telegram · WIN TP1 (runner line present)', buildOutcomeTelegram({ kind: 'win', side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', level: 1, holdingHours: 3.4, receiptUrl: URL })],
  ['Telegram · WIN TP2 (runner line omitted)', buildOutcomeTelegram({ kind: 'win', side: 'long', pair: 'LSK', timeframe: '4H', exchange: 'BITUNIX', entry: '12.4800', level: 2, holdingHours: 11.2, receiptUrl: 'https://trading365.org/signals/lsk-long-20260918-0915' })],
  ['Telegram · BIG WIN TP4', buildOutcomeTelegram({ kind: 'bigwin', side: 'short', pair: 'US', timeframe: '4H', exchange: 'OKX', entry: '0.0412', level: 4, receiptUrl: 'https://trading365.org/signals/us-short-20260916-2215' })],
  ['Telegram · BIG WIN TP5', buildOutcomeTelegram({ kind: 'bigwin', side: 'long', pair: 'PROM', timeframe: '4H', exchange: 'WEEX', entry: '3.8800', level: 5, receiptUrl: 'https://trading365.org/signals/prom-long-20260918-1400' })],
  ['Telegram · LOSS (short)', buildOutcomeTelegram({ kind: 'loss', side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', lossDistancePct: 3.62, receiptUrl: URL })],
  ['Telegram · LOSS (long, no receipt)', buildOutcomeTelegram({ kind: 'loss', side: 'long', pair: 'LSK', timeframe: '4H', exchange: 'BITUNIX', entry: '12.4800', lossDistancePct: 4.0, receiptUrl: null })],
]

const XSHAPES = [
  ['X · WIN', buildXTweet({ kind: 'win', side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', level: 1, receiptUrl: URL })],
  ['X · BIG WIN', buildXTweet({ kind: 'bigwin', side: 'short', pair: 'US', timeframe: '4H', exchange: 'OKX', entry: '0.0412', level: 4, receiptUrl: URL })],
  ['X · LOSS', buildXTweet({ kind: 'loss', side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', lossDistancePct: 3.62, receiptUrl: URL })],
  ['X · FIRED', buildXTweet({ kind: 'fired', side: 'short', pair: 'BTW', timeframe: '4H', exchange: 'MEXC', entry: '0.7029', tp1: '0.6929', stop: '0.7284', receiptUrl: URL })],
  ['X · WEEKLY DIGEST', buildWeeklyDigestTweet({ signals: 39, tpCount: 21, avgNet: 0.83 })],
  ['X · queue daily digest (unchanged)', buildDigestTweet({ fired: 39, wins: 26, losses: 8, hitRate: '76.5%', published: 2461, url: 'https://trading365.org/signals' })],
]

console.log(`posting mode: ${postingMode()}   max receipt posts/day: ${maxPostsPerDay()}`)

console.log('\n\n########## TELEGRAM — FIRED ##########')
for (const [label, text] of FIRED) {
  show(label, text)
  check('html-safe', isTelegramHtmlSafe(text))
}

console.log('\n\n########## TELEGRAM — CLOSE ##########')
for (const [label, text] of OUTCOME) {
  show(label, text)
  check('html-safe', isTelegramHtmlSafe(text))
}

console.log('\n\n########## X ##########')
for (const [label, text] of XSHAPES) {
  const n = tweetLength(text)
  show(`${label} — ${n}/${LIMIT}`, text)
  check('fits 280', n <= LIMIT, `(${n})`)
}

console.log('\n\n########## GUARDS ##########')
const PROMISES = [/\bguarantee/i, /\bpromis/i, /\bwill (rise|fall|moon|pump|print)\b/i, /\bprofit(able)?\b/i, /\bfree money\b/i]
let promiseHits = 0
for (const [label, text] of [...FIRED, ...OUTCOME, ...XSHAPES]) {
  const hit = PROMISES.filter((re) => re.test(text))
  if (hit.length) { promiseHits++; console.log(`   ${label}: ${hit.map(String).join(', ')}`) }
}
check('no return-promising language', promiseHits === 0)
for (const lvl of [1, 2, 3, 4, 5]) check(`tier ${lvl} renders`, tierPct(lvl) !== '', tierPct(lvl))

// ── Real data (opt-in) ──────────────────────────────────────────────────────
const wantLive = process.argv.includes('--live') || process.argv.includes('--all')
const wantCompare = process.argv.includes('--compare') || process.argv.includes('--all')

if (wantLive || wantCompare) {
  const { neon } = await import('@neondatabase/serverless')
  const { readFileSync } = await import('node:fs')
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  const sql = neon(process.env.DATABASE_URL)

  const COLS = `r.public_id, r.side, r.symbol, r.exchange, r.entry_price, r.stop_price,
                r.status, r.timeframe, r.fired_at::text AS fired_at, r.closed_at::text AS closed_at,
                s.triggered_at::text AS triggered_at, s.score, s.raw_score`
  const recent = await sql(`
    SELECT ${COLS} FROM signal_receipts r
    LEFT JOIN telegram_alerts s ON r.source_table = 'telegram_alerts' AND s.id = r.source_id
    WHERE r.origin = 'live' AND r.status <> 'fired'
    ORDER BY r.closed_at DESC NULLS LAST LIMIT 3`, [])
  const latestFired = await sql(`
    SELECT ${COLS} FROM signal_receipts r
    LEFT JOIN telegram_alerts s ON r.source_table = 'telegram_alerts' AND s.id = r.source_id
    WHERE r.origin = 'live' ORDER BY r.fired_at DESC LIMIT 1`, [])

  const MULT = (side) => ({ 1: side === 'short' ? 0.985 : 1.015, 2: side === 'short' ? 0.975 : 1.025, 3: side === 'short' ? 0.96 : 1.04, 4: side === 'short' ? 0.94 : 1.06, 5: side === 'short' ? 0.92 : 1.08 })
  const GAIN = [1.5, 2.5, 4, 6, 8]
  const px = (n) => Number(n).toFixed(6)
  const dist = (r) => {
    const e = Number(r.entry_price), s = Number(r.stop_price)
    return e > 0 && s > 0 ? Math.abs(((r.side === 'short' ? s - e : e - s) / e) * 100) : 0
  }

  if (wantLive) {
    console.log('\n\n########## LIVE RECEIPTS (rendered from real rows) ##########')
    for (const r of [...latestFired, ...recent]) {
      const lvl = String(r.status).startsWith('tp') ? Number(String(r.status).slice(2)) : 0
      const kind = r.status === 'sl' ? 'loss' : lvl >= 4 ? 'bigwin' : 'win'
      const base = { side: r.side, pair: String(r.symbol).replace('USDT', ''), timeframe: r.timeframe, exchange: String(r.exchange).toUpperCase(), entry: px(r.entry_price), receiptUrl: `https://trading365.org/signals/${r.public_id}` }
      show(`${r.public_id} (${r.status}) — TELEGRAM`, buildOutcomeTelegram({ ...base, kind, level: lvl || 1, holdingHours: 6, lossDistancePct: dist(r) }))
      const xt = buildXTweet({ ...base, kind, level: lvl || 1, lossDistancePct: dist(r) })
      show(`${r.public_id} — X (${tweetLength(xt)}/${LIMIT})`, xt)
      check('fits 280', tweetLength(xt) <= LIMIT)
    }
  }
if (wantCompare) {
    // OLD templates, verbatim from the pre-rewrite routes, so this is a real
    // before/after rather than a paraphrase of the old output.
    const div = '━━━━━━━━━━━━━━━━━━'
    const oldFired = (d) => '<b>' + [
      div, d.side === 'short' ? '🔴 SHORT SIGNAL' : '🟢 LONG SIGNAL', div, '',
      `💰 $${d.pair}`,
      `📊 Score: ${d.score} (${d.raw})`,
      `🏦 Exchange: ${d.exchange}`,
      d.side === 'short' ? '📉 Market: BEARISH ✅' : '📈 Market: BULLISH ✅', '',
      `💲 Entry: $${d.entry}`, '',
      '🎯 Targets:',
      ...(d.side === 'short'
        ? [`   TP1: $${d.tp1} (-1.5%)`, `   TP2: $${d.tp2} (-2.5%)`, `   TP3: $${d.tp3} (-4.0%)`]
        : [`   TP1: $${d.tp1} (+1.5%)`, `   TP2: $${d.tp2} (+2.5%)`, `   TP3: $${d.tp3} (+4.0%)`, `   TP4: $${d.tp4} (+6.0%)`, `   TP5: $${d.tp5} (+8.0%)`]),
      '', `🛑 Stop: $${d.stop}`, '',
      `📋 Signals: ${d.signals}`, '',
      d.side === 'short' ? '⚡ trading365.org/scanner' : '⚡ trading365.org/scanner/longs',
      div,
    ].join('\n') + '</b>'
    const oldClose = (d) => [
      `✅ TARGET HIT — $${d.pair}`,
      `Exchange: ${d.exchange}`,
      `${d.side === 'short' ? 'Short' : 'Long'} entry: $${d.entry}`,
      `Reached: ${d.hitLabels}`,
      `Target price: $${d.targetPrice}`,
      `Signal confirmed 🎯`,
    ].join('\n')

    console.log('\n\n########## OLD vs NEW — most recent real signals ##########')
    const row = latestFired[0]
    if (row) {
      const side = row.side, e = Number(row.entry_price), st = Number(row.stop_price), m = MULT(side)
      console.log(`\n--- FIRED: ${row.public_id} | ${row.symbol} ${String(side).toUpperCase()} ${row.exchange} | fired ${row.fired_at}`)
      show('OLD (pre-rewrite)', oldFired({
        side, pair: String(row.symbol).replace('USDT', ''), score: row.score, raw: row.raw_score,
        exchange: String(row.exchange).toUpperCase(), entry: px(e), stop: px(st),
        signals: '<signal list>',
        tp1: px(e * m[1]), tp2: px(e * m[2]), tp3: px(e * m[3]), tp4: px(e * m[4]), tp5: px(e * m[5]),
      }))
      show('NEW (shipped)', buildFiredTelegram({
        side, pair: String(row.symbol).replace('USDT', ''), timeframe: row.timeframe,
        exchange: String(row.exchange).toUpperCase(), entry: px(e),
        tiers: [1, 2, 3, 4, 5].slice(0, side === 'short' ? 3 : 5).map((l) => ({
          label: `TP${l}`, price: px(e * m[l]),
          pct: `${side === 'short' ? '-' : '+'}${GAIN[l - 1].toFixed(1)}%`,
        })),
        stop: px(st), receiptUrl: `https://trading365.org/signals/${row.public_id}`,
      }))
    }
    for (const r of recent.slice(0, 2)) {
      const lvl = String(r.status).startsWith('tp') ? Number(String(r.status).slice(2)) : 0
      const e = Number(r.entry_price), m = MULT(r.side)
      console.log(`\n--- CLOSED: ${r.public_id} | ${r.symbol} ${String(r.side).toUpperCase()} ${r.exchange} | ${r.status} | closed ${r.closed_at}`)
      if (r.status === 'sl') {
        show('OLD (pre-rewrite)', '(NO MESSAGE — the stop branch only wrote to the database)')
      } else {
        show('OLD (pre-rewrite)', oldClose({
          side: r.side, pair: String(r.symbol).replace('USDT', ''), exchange: String(r.exchange).toUpperCase(),
          entry: px(e), hitLabels: `TP${lvl} (-${GAIN[lvl - 1] || 1.5}%)`,
          targetPrice: px(e * (m[lvl] || 1)),
        }))
      }
      show('NEW (shipped)', buildOutcomeTelegram({
        kind: r.status === 'sl' ? 'loss' : lvl >= 4 ? 'bigwin' : 'win',
        side: r.side, pair: String(r.symbol).replace('USDT', ''), timeframe: r.timeframe,
        exchange: String(r.exchange).toUpperCase(), entry: px(e),
        level: lvl || 1, holdingHours: 6, lossDistancePct: dist(r),
        receiptUrl: `https://trading365.org/signals/${r.public_id}`,
      }))
    }
  }
}

console.log(`\n\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1