/**
 * Post ONE tweet to X, on demand.
 *
 * WHY THIS EXISTS
 * The cron path spends a whole day's allowance at once, which is the wrong tool
 * both for "does posting actually work?" and for a one-off announcement. This
 * posts exactly one, composed by the SAME renderer the cron uses — renderXDaily
 * from lib/daily-update.ts — so what it publishes is byte-identical to what the
 * automated path would have published for that day.
 *
 * SAFETY
 * Preview by default. Nothing is sent without --yes, because the one thing this
 * script must never do by accident is publish to the brand account.
 *
 * --yes also forces X_POSTING_MODE=live for THIS PROCESS ONLY. Without that the
 * local default of 'dry' would make postTweet() return ok:true without calling X
 * at all — a silent no-op reported as success, which is the worst possible
 * outcome for a test whose entire purpose is to prove the call works.
 *
 *   node --env-file=.env.local scripts/x-post-one.mjs                      preview the daily update
 *   node --env-file=.env.local scripts/x-post-one.mjs --yes                POST the daily update
 *   node --env-file=.env.local scripts/x-post-one.mjs --day 2026-09-20 --yes
 *   node --env-file=.env.local scripts/x-post-one.mjs --text "hello" --yes
 */
import { getArchiveStatsForDay, getDayBest, getPublishedCount, SITE } from '../lib/signals/public.ts'
import { buildDailyUpdate, previousUtcDay, renderXDaily } from '../lib/daily-update.ts'
import { postTweet, postingMode, tweetLength, xConfigured } from '../lib/x.ts'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const send = has('--yes')
const textArg = val('--text')
const dayArg = val('--day')

// Force live only when the caller has explicitly said to send. Everything else
// keeps the ambient mode so a preview can never reach X.
if (send) process.env.X_POSTING_MODE = 'live'

const day = /^\d{4}-\d{2}-\d{2}$/.test(dayArg ?? '') ? dayArg : previousUtcDay()

console.log('== state ==')
console.log(`  posting mode   ${postingMode()}${send ? '  (forced by --yes)' : ''}`)
console.log(`  credentials    ${xConfigured() ? 'all four present' : 'MISSING'}`)
console.log(`  sending        ${send ? 'YES — this will publish' : 'no (preview only; pass --yes to send)'}`)

let text
if (textArg) {
  text = textArg
  console.log('  source         --text')
} else {
  console.log(`  source         daily update for ${day}`)
  const [stats, best, publishedTotal] = await Promise.all([
    getArchiveStatsForDay(day),
    getDayBest(day),
    getPublishedCount(),
  ])
  text = renderXDaily(
    buildDailyUpdate({
      day,
      stats,
      best,
      publishedTotal,
      url: `${SITE}/signals`,
      generatedAt: new Date().toISOString(),
    }),
  )
  console.log(`  day numbers    ${stats.fired} fired · ${stats.wins} win · ${stats.losses} stopped`)
}

const len = tweetLength(text)
console.log('\n== the exact tweet ==')
console.log(text)
console.log('== end ==')
console.log(`\n  length ${len}/280 (X counts every URL as 23)`)
if (/undefined|NaN/.test(text)) {
  console.error('\nREFUSING: the composed text contains undefined/NaN. Fix the renderer first.')
  process.exit(1)
}
if (len > 280) {
  console.error('\nREFUSING: over the 280 limit.')
  process.exit(1)
}

if (!send) {
  console.log('\nPreview only. Re-run with --yes to publish.')
  process.exit(0)
}

if (!xConfigured()) {
  console.error('\nREFUSING: X credentials are not configured.')
  process.exit(1)
}

console.log('\nposting...')
const res = await postTweet(text)
if (!res.ok) {
  console.error(`FAILED: ${res.error}`)
  if (res.billingBlocked) {
    console.error('This is a BILLING block (HTTP 402 / credits-depleted), not a code fault.')
    console.error('Add credits or a plan under Subscriptions in the X developer portal.')
  }
  process.exit(1)
}
console.log(`POSTED — tweet id ${res.id}`)
console.log(`  https://x.com/i/status/${res.id}`)
