/**
 * Cron runner for the Railway worker service.
 *
 * WHY THIS EXISTS
 * On Vercel the 13 entries in vercel.json's `crons` array were fired by the
 * platform as HTTP calls into the app's own /api/* routes, each carrying
 * ?cron=true — which is what makes those endpoints accept the call without auth.
 * Railway has no HTTP crons, so the same 13 schedules are registered here and
 * fired at the deployed app. The table below is a 1:1 port of that array: path
 * (query string included) and expression unchanged, so nothing about the
 * endpoints or their auth contract had to move.
 *
 * Every expression is evaluated in UTC, matching Vercel's cron behaviour, and
 * you should run the service with TZ=UTC as well so the log timestamps line up
 * with the schedules.
 *
 *   node scripts/cron-runner.mjs                                          always-on worker
 *   node scripts/cron-runner.mjs --once "/api/scanner/entries?cron=true"  fire one path now
 *
 * The base URL comes from CRON_BASE_URL (default http://localhost:3000 for a
 * local run against `pnpm dev`). Each request is capped at 90s. A failure is
 * logged and dropped: one dead endpoint must never take the scheduler down, and
 * jobs never wait on each other. --once exits non-zero when the request fails,
 * so it can be used as a health probe.
 */
import cron from 'node-cron'
import fs from 'node:fs'

const BASE_URL = (process.env.CRON_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const REQUEST_TIMEOUT_MS = 90_000

// Ported 1:1 from vercel.json "crons" — path and schedule unchanged.
const SCHEDULES = [
  { path: '/api/scanner/watchlist?cron=true', schedule: '*/30 * * * *' },
  { path: '/api/scanner/long-watchlist?cron=true', schedule: '*/30 * * * *' },
  { path: '/api/scanner/entries?cron=true', schedule: '*/15 * * * *' },
  { path: '/api/scanner/long-entries?cron=true', schedule: '*/15 * * * *' },
  { path: '/api/scanner/outcomes?cron=true', schedule: '0 * * * *' },
  { path: '/api/scanner/monitor?cron=true', schedule: '7,22,37,52 * * * *' },
  { path: '/api/scanner/long-monitor?cron=true', schedule: '9,24,39,54 * * * *' },
  { path: '/api/pay/expiry?cron=true', schedule: '0 3 * * *' },
  { path: '/api/scanner/daily-update?cron=true', schedule: '0 8 * * *' },
  { path: '/api/admin/affiliate-earnings/sync?cron=true', schedule: '23 6 * * *' },
  { path: '/api/admin/signals/backfill?cron=true&apply=true&limit=5000', schedule: '17 4 * * *' },
  { path: '/api/social/x?cron=true', schedule: '*/30 * * * *' },
  { path: '/api/scanner/shadow-patterns?cron=true', schedule: '13,43 * * * *' },
]

const now = () => new Date().toISOString()

function emit(level, path, status, ms, note) {
  const line = `${now()} ${level} ${String(status).padStart(4)} ${String(ms).padStart(6)}ms ${path}`
  const text = note ? `${line} — ${note}` : line
  if (level === 'OK') console.log(text)
  else console.error(text)
}

/**
 * Undici reports a refused connection as TypeError("fetch failed") with the real
 * reason on .cause — and when the host resolves to more than one address (::1
 * and 127.0.0.1 for localhost) that cause is an AggregateError whose own message
 * is empty. Falling back to err.message alone would log "fetch failed" and lose
 * the address and errno, which are the only actionable parts.
 */
function errorNote(err) {
  if (err?.name === 'AbortError') return `timeout after ${REQUEST_TIMEOUT_MS}ms`
  const cause = err?.cause
  const fromCause =
    cause instanceof AggregateError
      ? [...cause.errors].map((e) => e?.message)
      : [cause?.message]
  return (
    [...fromCause, err?.message, String(err)].find((m) => typeof m === 'string' && m.trim()) ??
    'unknown error'
  )
}

/**
 * Fire one path and report it. Never rejects: a caller gets {ok:false} and the
 * failure is already on stderr, so a broken endpoint cannot escape into the
 * scheduler.
 */
async function runPath(path) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal })
    const ms = Date.now() - started
    // Read the body even though it is unused: an unread body keeps the socket in
    // use, and the error text is the only clue a failing endpoint gives.
    const body = await res.text().catch(() => '')
    if (res.ok) {
      emit('OK', path, res.status, ms)
      return { ok: true, status: res.status, ms }
    }
    emit('FAIL', path, res.status, ms, body.replace(/\s+/g, ' ').slice(0, 200))
    return { ok: false, status: res.status, ms }
  } catch (err) {
    const ms = Date.now() - started
    emit('FAIL', path, '----', ms, errorNote(err).replace(/\s+/g, ' ').slice(0, 200))
    return { ok: false, status: null, ms }
  } finally {
    clearTimeout(timer)
  }
}

function arm() {
  const invalid = SCHEDULES.filter((job) => !cron.validate(job.schedule))
  if (invalid.length > 0) {
    // A typo ported over from vercel.json would otherwise arm a job that never
    // fires, which looks exactly like a working deploy in the logs.
    for (const job of invalid) {
      console.error(`invalid cron expression for ${job.path}: "${job.schedule}"`)
    }
    process.exitCode = 1
    return
  }

  console.log(`${now()} cron-runner armed: ${SCHEDULES.length} schedules -> ${BASE_URL} (UTC)`)
  for (const job of SCHEDULES) {
    const task = cron.schedule(
      job.schedule,
      async () => {
        // runPath already swallows its own failures; this guard is here so that a
        // bug in the reporting path cannot reject and kill a scheduled task.
        try {
          await runPath(job.path)
        } catch (err) {
          console.error(`${now()} FAIL ${job.path} — ${String(err).slice(0, 200)}`)
        }
      },
      // noOverlap: a run that is still in flight when the next tick lands is
      // skipped rather than stacked (the 90s cap keeps that rare).
      { timezone: 'UTC', name: job.path, noOverlap: true },
    )
    const next = task.getNextRun()
    console.log(
      `  ${job.schedule.padEnd(16)} ${job.path.padEnd(52)} next ${next ? next.toISOString() : 'n/a'}`,
    )
  }

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      // fs.writeSync, not console.log: process.exit() drops output still queued on
      // a piped stdout, and Railway reads these logs from a pipe.
      fs.writeSync(1, `${now()} ${signal} received — shutting down\n`)
      process.exit(0)
    })
  }
}

const argv = process.argv.slice(2)
const onceIndex = argv.findIndex((a) => a === '--once' || a.startsWith('--once='))
const oncePath =
  onceIndex < 0
    ? null
    : argv[onceIndex].startsWith('--once=')
      ? argv[onceIndex].slice('--once='.length)
      : (argv[onceIndex + 1] ?? '')

if (oncePath === null) {
  arm()
} else if (!oncePath) {
  console.error('usage: node scripts/cron-runner.mjs --once "/api/scanner/watchlist?cron=true"')
  process.exitCode = 2
} else {
  console.log(`${now()} once: ${BASE_URL}${oncePath}`)
  const result = await runPath(oncePath)
  // Exit via exitCode rather than process.exit(): killing the process while
  // undici still holds sockets can trip a libuv assertion on Windows.
  process.exitCode = result.ok ? 0 : 1
}
