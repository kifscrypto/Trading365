/**
 * What times will the X account actually post today?
 *
 * Reads the REAL config from lib/x.ts (minGapMinutes, maxPostsPerDay,
 * firstPostDelayMinutes, dayResetHourUtc) and models the decision order inside
 * drainReceiptQueue: cap, then the first-post hold, then the pacing gap. Only the
 * loop is modelled — the numbers are the live ones, so this cannot quietly disagree
 * with production about the settings.
 *
 * It is a MODEL, not the code path, so treat it as a forecast rather than proof.
 * The authoritative answer for a given run is the `blockedBy` field on
 * /api/social/x?cron=true.
 *
 *   node --env-file=.env.local scripts/x-schedule.mjs
 */
import {
  dayResetHourUtc, firstPostDelayMinutes, maxPostsPerDay, minGapMinutes, postingDayStart,
} from '../lib/x.ts'

const TICK_MIN = 30 // the Vercel cron is */30 * * * *
const cap = maxPostsPerDay()
const gap = minGapMinutes()
const hold = firstPostDelayMinutes()
const resetHour = dayResetHourUtc()

console.log('== settings (live, from lib/x.ts) ==')
console.log(`  X_MAX_POSTS_PER_DAY          ${cap}`)
console.log(`  X_MIN_GAP_MINUTES            ${gap}`)
console.log(`  X_FIRST_POST_DELAY_MINUTES   ${hold}`)
console.log(`  X_DAY_RESET_HOUR_UTC         ${resetHour}`)

// The current posting day, ticked every 30 minutes from here.
const dayStart = postingDayStart(new Date(), resetHour)

// Simulate TWO posting days and report the second. A single day depends on when
// yesterday's last receipt landed, which is itself the product of this schedule —
// so the settled answer only appears once the loop feeds its own output back in.
// (The first cut of this script hard-coded "yesterday's last post was 2h before the
// window", which pushed the first post to 11:00 instead of 10:00 via the 5-hour
// gap. A wrong assumption about the initial state looked exactly like a schedule.)
let lastAt = 0
let postedInDay = 0
let currentDay = -1
const dayTimes = []

for (let t = dayStart.getTime(); t < dayStart.getTime() + 48 * 60 * 60_000; t += TICK_MIN * 60_000) {
  const day = Math.floor((t - dayStart.getTime()) / (24 * 60 * 60_000))
  if (day !== currentDay) { currentDay = day; postedInDay = 0; dayTimes.push([]) }

  const allowance = cap - postedInDay
  if (allowance === 0) continue

  // First-post hold: only while no receipt has gone out in this posting day.
  if (postedInDay === 0 && hold > 0) {
    const earliest = dayStart.getTime() + day * 24 * 60 * 60_000 + hold * 60_000
    if (t < earliest) continue
  }

  // Pacing gap. `lastAt === 0` means no previous post exists at all.
  if (gap > 0 && lastAt > 0 && t < lastAt + gap * 60_000) continue

  postedInDay++
  lastAt = t
  dayTimes[day].push(t)
}

const times = dayTimes[1] ?? []
const fmt = (d) => new Date(d).toISOString().slice(11, 16) + ' UTC'
const local = (d) => {
  const t = new Date(d).getTime() + 3 * 60 * 60_000 // UTC+3, the owner's locale
  return String(new Date(t).getUTCHours()).padStart(2, '0') + ':' + String(new Date(t).getUTCMinutes()).padStart(2, '0')
}

const settledStart = new Date(dayStart.getTime() + 24 * 60 * 60_000)
console.log(`\n== receipts for a SETTLED posting day (from ${settledStart.toISOString().slice(0, 16)}Z) ==`)
if (times.length === 0) {
  console.log('  (none — check the settings above)')
} else {
  times.forEach((t, i) => console.log(`  receipt ${i + 1}:  ${fmt(t)}   (${local(t)} local)`))
}
console.log(`\n  receipts: ${times.length} of ${cap}`)
console.log(`  digest:   ${String(resetHour).padStart(2, '0')}:00 UTC (${String(resetHour + 3).padStart(2, '0')}:00 local), posted alone`)
console.log(`  tweets per day: ${times.length + 1}`)

// The one thing that must never come back: the whole allowance at the boundary.
const atBoundary = times.filter((t) => t < settledStart.getTime() + 60_000).length
const quiet = 24 * 60 - (times.length > 0 ? Math.round((times[times.length - 1] - settledStart.getTime()) / 60_000) : 0)
console.log(`\n  posts inside the first minute of the window: ${atBoundary} ${atBoundary === 0 ? '(no burst)' : '(BURST!)'}`)
console.log(`  longest quiet stretch: ${Math.floor(quiet / 60)}h ${quiet % 60}m (last post to the next window)`)