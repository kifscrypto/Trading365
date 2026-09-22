/**
 * X posting queue: what gets posted, in what order, and how often.
 *
 * Volume reality: the scanner closes ~39 signals a day (busiest 123). Posting
 * every closure would read as a bot and bury the good results, so the policy is
 * at most X_MAX_POSTS_PER_DAY receipts (default 6), ranked by notability with one
 * slot reserved for a loss, plus one daily digest.
 *
 * Only origin='live' rows are ever queued — the 2,249 reconstructed history
 * pages stay out of the timeline — and only within MAX_AGE_HOURS of resolving,
 * so nothing stale gets announced days later.
 *
 * The pure decisions live in lib/x.ts so they can be tested without a database;
 * this module is the thin SQL + adapter layer around them.
 */
import { neon } from '@neondatabase/serverless'
import {
  SITE, displayPair, fmtPrice, getArchiveStatsForDay, getDayBest,
  getPublishedCount, receiptUrl,
  type Receipt,
} from '@/lib/signals/public'
import {
  choosePosts, dayResetHourUtc, maxPostsPerDay, minGapMinutes, postingMode,
  postingDayStart, postTweet, type PostCandidate,
} from '@/lib/x'
import { buildXTweet, type XSignalInput } from '@/lib/signal-messages'
import { buildDailyUpdate, previousUtcDay, renderXDaily } from '@/lib/daily-update'

const db = neon(process.env.DATABASE_URL!)

/** Signals older than this are not worth announcing. */
const MAX_AGE_HOURS = 24
/** Candidates pulled before the policy trims them. */
const CANDIDATE_POOL = 60
/** Biggest losses pulled SEPARATELY — see candidatePool. */
const LOSS_POOL = 10

export async function setupXPostsTable(): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS x_posts (
      id         BIGSERIAL PRIMARY KEY,
      kind       TEXT NOT NULL,              -- receipt | digest
      ref        TEXT NOT NULL,              -- public_id, or YYYY-MM-DD for a digest
      text       TEXT NOT NULL,
      tweet_id   TEXT,
      status     TEXT NOT NULL DEFAULT 'posted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT x_posts_kind_ref_uniq UNIQUE (kind, ref)
    )
  `
}

/**
 * Receipt posts already made in the current POSTING day, for the daily cap.
 *
 * Counted from postingDayStart(), NOT from the UTC midnight. Counting from
 * midnight meant the allowance refilled at 00:00 UTC — 3am for a UTC+3 owner —
 * and the whole day's posts went out in one burst.
 */
export async function postsToday(): Promise<number> {
  const start = postingDayStart(new Date())
  const rows = (await db`
    SELECT COUNT(*)::int AS n FROM x_posts
    WHERE kind = 'receipt' AND created_at >= ${start.toISOString()}::timestamptz
  `) as unknown as { n: number }[]
  return rows[0]?.n ?? 0
}

/**
 * When the last receipt post went out, or null if there has never been one.
 *
 * Manual handoffs count: the owner is still being asked to handle a post, so the
 * pacing that keeps the channel readable has to apply to them too.
 */
export async function lastReceiptPostAt(): Promise<Date | null> {
  const rows = (await db`
    SELECT created_at FROM x_posts
    WHERE kind = 'receipt'
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as { created_at: string }[]
  const at = rows[0]?.created_at
  return at ? new Date(at) : null
}

/**
 * Unposted, fresh, live-origin receipts worth considering.
 *
 * TWO pools, UNIONed, and the second one is the important part.
 *
 * Ordering by `abs_move` alone cannot surface a loss. A stop sits wherever the
 * setup put it (−2% to −4%) while every TP hit records its TARGET distance
 * (+1.5% to +8%), so on a busy day the top 60 by |move| are ALL winners and the
 * reserved loss slot would have nothing to fill — the account would quietly become
 * the highlight reel that reservation exists to prevent. Pulling the biggest
 * losses separately guarantees that slot always has candidates.
 *
 * `hours_to_close` and `mfe_pct` are what choosePosts actually ranks on; abs_move
 * cannot tell two winners apart, because every TP5 is exactly 8.0.
 */
export async function candidatePool(): Promise<(Receipt & PostCandidate)[]> {
  return (await db`
    WITH pool AS (
      SELECT *,
             ABS(COALESCE(move_pct, 0))::float AS abs_move,
             (EXTRACT(EPOCH FROM (closed_at - fired_at)) / 3600.0)::float AS hours_to_close
      FROM signal_receipts
      WHERE posted_to_x = FALSE
        AND origin = 'live'
        AND status <> 'fired'
        AND closed_at IS NOT NULL
        AND closed_at > NOW() - (${MAX_AGE_HOURS}::int * INTERVAL '1 hour')
    ),
    notable AS (
      SELECT * FROM pool ORDER BY abs_move DESC, closed_at DESC LIMIT ${CANDIDATE_POOL}
    ),
    biggest_losses AS (
      SELECT * FROM pool WHERE status = 'sl' ORDER BY abs_move DESC LIMIT ${LOSS_POOL}
    )
    SELECT * FROM notable
    UNION
    SELECT * FROM biggest_losses
  `) as unknown as (Receipt & PostCandidate)[]
}

function toXSignal(r: Receipt): XSignalInput {
  // The receipt's own status decides the shape: 'sl' is the loss template, TP4/TP5
  // the big-win template, everything else the standard win.
  const level = r.status.startsWith('tp') ? Number(r.status.slice(2)) : 0
  const kind = r.status === 'sl' ? 'loss' : level >= 4 ? 'bigwin' : 'win'
  // Stop distance from the stored levels — the fill price is not recorded, so this
  // is the stop's own distance, the same figure the close telegram quotes.
  const entry = Number(r.entry_price)
  const stop = Number(r.stop_price)
  const lossDistancePct =
    entry > 0 && isFinite(stop) && stop > 0
      ? Math.abs(((r.side === 'short' ? stop - entry : entry - stop) / entry) * 100)
      : 0
  return {
    kind,
    side: r.side,
    pair: displayPair(r.symbol),
    timeframe: r.timeframe,
    exchange: r.exchange.toUpperCase(),
    entry: fmtPrice(r.entry_price),
    level: level || 1,
    lossDistancePct,
    receiptUrl: receiptUrl(r.public_id),
  }
}

export interface DrainResult {
  mode: string
  /** Receipts X accepted on this run. Always empty in dry mode. */
  posted: string[]
  /** Dry mode only: the receipts that WOULD be posted. Nothing is written for these. */
  wouldPost: string[]
  /** Manual mode only: the receipts handed to Telegram for publishing by hand. */
  manual: string[]
  failed: string[]
  allowance: number
  /** Receipts already posted in the current posting day. */
  usedToday: number
  /** The configured daily cap, so a caller can report "3 of 6". */
  cap: number
  /**
   * Why the run produced nothing. Without this a silent cron and a broken one
   * look identical in the logs, which is how "nothing is posting" turns into a
   * hunt for a code bug when the real answer is a spent cap or an empty balance.
   */
  blockedBy?: 'daily-cap' | 'min-gap' | 'billing' | 'no-candidates'
  /** ISO time the next post is permitted, when blocked by the pacing gap. */
  nextAllowedAt?: string
}

/**
 * Hand a composed post to Telegram so the owner can publish it.
 *
 * X bills API usage with prepaid credits, so a paid plan is not always worth it
 * for a handful of posts a day. Manual mode keeps everything the queue already
 * does — the same selection policy, the same 24h freshness window, the same
 * ≤N/day cap, the same idempotency — and stops one step short of publishing.
 *
 * Destination: X_MANUAL_TELEGRAM_CHAT_ID when set, otherwise the scanner's own
 * TELEGRAM_CHAT_ID. Falling back to the existing channel is deliberate — the
 * channel is already configured and the owner chose it — and it means manual mode
 * needs no new configuration at all. The text is sent inside a code block, which
 * Telegram gives a one-tap copy button, and because it contains the receipt URL,
 * X unfurls the branded receipt card when the owner pastes it.
 *
 * No prefix line: this lands in a channel members read, so an internal-looking
 * "copy and publish" header would read as a staging area. The composed text is
 * self-describing and stands on its own.
 *
 * Returns false when no destination is configured, so the caller leaves the
 * receipt queued rather than recording a handoff nobody received.
 */
async function handOffToTelegram(text: string): Promise<boolean> {
  const chatId = process.env.X_MANUAL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!chatId || !token) {
    console.error('[x-queue] manual mode needs a destination (X_MANUAL_TELEGRAM_CHAT_ID or TELEGRAM_CHAT_ID) and TELEGRAM_BOT_TOKEN')
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `<code>${telegramEscape(text)}</code>`,
        parse_mode: 'HTML',
      }),
    })
    if (!res.ok) {
      console.error('[x-queue] manual handoff failed:', res.status, (await res.text()).slice(0, 200))
      return false
    }
    return true
  } catch (err) {
    console.error('[x-queue] manual handoff failed:', err)
    return false
  }
}

/** Telegram's HTML parse mode needs exactly these three, and tweet text has them. */
function telegramEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Record a MANUAL handoff. Status 'manual' (never 'posted') so the table never
 * claims X accepted something it never saw, while posted_to_x still clears the
 * receipt from candidatePool() — a handoff that repeats every 30 minutes would
 * be worse than no handoff at all.
 */
async function recordManualHandoff(publicId: string, text: string): Promise<void> {
  try {
    await db`
      INSERT INTO x_posts (kind, ref, text, tweet_id, status)
      VALUES ('receipt', ${publicId}, ${text}, NULL, 'manual')
      ON CONFLICT ON CONSTRAINT x_posts_kind_ref_uniq DO NOTHING
    `
    await db`UPDATE signal_receipts SET posted_to_x = TRUE WHERE public_id = ${publicId}`
  } catch (err) {
    console.error('[x-queue] could not record manual handoff:', err)
  }
}

/**
 * Post up to the remaining daily allowance. Never throws — the same contract as
 * lib/discord.ts, because this runs from a cron.
 *
 * A post is only recorded (x_posts row + posted_to_x flag) AFTER the API call
 * succeeds, so a failure is retried on the next run rather than silently lost.
 *
 * A DRY RUN RECORDS NOTHING. It used to fall through the same branch, because
 * postTweet() reports ok in dry mode without ever calling X — so each dry cron
 * run wrote an x_posts row (tweet_id 'dry-run'), set posted_to_x = TRUE on the
 * receipt and spent that day's allowance. posted_to_x = FALSE is precisely how
 * candidatePool() finds work, so those receipts could never be announced, and
 * the day the credentials arrived the queue would have looked empty — i.e. a
 * credential problem, not a bug. Nothing can un-set that flag by accident, so
 * dry mode must not touch it.
 */
export async function drainReceiptQueue(): Promise<DrainResult> {
  const cap = maxPostsPerDay()
  const out: DrainResult = {
    mode: postingMode(), posted: [], wouldPost: [], manual: [], failed: [],
    allowance: 0, usedToday: 0, cap,
  }
  try {
    await setupXPostsTable()
    const used = await postsToday()
    const allowance = Math.max(0, cap - used)
    out.allowance = allowance
    out.usedToday = used
    if (allowance === 0) {
      out.blockedBy = 'daily-cap'
      return out
    }

    // PACE THE DAY. The allowance refills in one go, so without a floor the
    // account spends all of it in a minute and then goes quiet for 24 hours.
    const gap = minGapMinutes()
    const last = await lastReceiptPostAt()
    if (gap > 0 && last) {
      const nextAt = new Date(last.getTime() + gap * 60_000)
      if (Date.now() < nextAt.getTime()) {
        out.blockedBy = 'min-gap'
        out.nextAllowedAt = nextAt.toISOString()
        return out
      }
    }

    const candidates = await candidatePool()
    if (candidates.length === 0) {
      out.blockedBy = 'no-candidates'
      return out
    }

    const chosen = choosePosts(candidates, allowance)

    // PACE WITHIN THE RUN TOO. The check above compares only against the PREVIOUS
    // run's last post, so a single run would spend the whole allowance back to back.
    // Because the allowance refills in one step at the window boundary, the first run
    // after 08:00 published every post within five seconds — x_posts shows
    // 2026-09-21 08:00:05.864 through 08:00:10.943, six of them. That was the exact
    // burst the window move was meant to fix; it had only been shifted from 00:00 to
    // 08:00. Tracking the clock as we go makes the gap mean what it says: with a
    // 30-minute cron and a 90-minute gap this settles at roughly one post every 90
    // minutes, which is the pacing the account actually wants.
    let lastAt = last ? last.getTime() : 0

    for (const r of chosen) {
      if (gap > 0 && lastAt > 0 && Date.now() < lastAt + gap * 60_000) {
        out.blockedBy = 'min-gap'
        out.nextAllowedAt = new Date(lastAt + gap * 60_000).toISOString()
        break
      }
      const text = buildXTweet(toXSignal(r))
      // Manual mode: hand it over and stop. Everything above this line — the
      // selection policy, the window, the cap — already ran, so a handoff is as
      // selective as a real post would have been.
      if (out.mode === 'manual') {
        if (!(await handOffToTelegram(text))) {
          out.failed.push(r.public_id)
          continue
        }
        await recordManualHandoff(r.public_id, text)
        out.manual.push(r.public_id)
        lastAt = Date.now()
        continue
      }
      const res = await postTweet(text)
      if (!res.ok) {
        out.failed.push(r.public_id)
        if (res.billingBlocked) {
          // A billing block fails EVERY candidate identically, so stop instead of
          // walking the pool logging the same 402 six times. The receipts stay
          // queued (nothing is recorded), so they post once credits are added.
          out.blockedBy = 'billing'
          break
        }
        continue
      }
      if (res.dry) {
        out.wouldPost.push(r.public_id)
        continue
      }
      try {
        await db`
          INSERT INTO x_posts (kind, ref, text, tweet_id, status)
          VALUES ('receipt', ${r.public_id}, ${text}, ${res.id ?? null}, 'posted')
          ON CONFLICT ON CONSTRAINT x_posts_kind_ref_uniq DO NOTHING
        `
        await db`UPDATE signal_receipts SET posted_to_x = TRUE WHERE public_id = ${r.public_id}`
      } catch (err) {
        console.error('[x-queue] could not record post:', err)
      }
      lastAt = Date.now()
      out.posted.push(r.public_id)
    }
  } catch (err) {
    console.error('[x-queue] drain failed:', err)
  }
  return out
}

/**
 * True once the configured UTC hour has passed (the digest is a once-a-day post).
 *
 * Default 8 so the X digest lands with the Telegram and Discord daily update
 * rather than three hours away from it. Override with X_DIGEST_HOUR_UTC.
 */
export function digestDue(now: Date = new Date()): boolean {
  const hour = Number(process.env.X_DIGEST_HOUR_UTC ?? 8)
  return now.getUTCHours() >= (Number.isFinite(hour) ? hour : 8)
}

export interface DigestResult {
  posted: boolean
  reason?: string
  text?: string
}

/**
 * One aggregate post per UTC day. Idempotent on the date, so re-running the cron
 * cannot repeat it.
 *
 * THE NUMBERS COME FROM lib/daily-update.ts — the same module the Telegram and
 * Discord daily update render from. This used to run its own COUNT over the
 * IN-PROGRESS day, so the X digest could quote a different figure than the
 * Discord snapshot for the same 24 hours, and its hit rate kept moving after
 * publication. The day reported is now the one that ended.
 *
 * A quiet day still posts: renderXDaily reports the gate standing the book down
 * as the fact it is. The old early return skipped it, which made the account look
 * dead on exactly the days it had something honest to say.
 */
export async function postDailyDigest(): Promise<DigestResult> {
  try {
    await setupXPostsTable()
    const day = previousUtcDay()

    const already = (await db`
      SELECT 1 FROM x_posts WHERE kind = 'digest' AND ref = ${day} LIMIT 1
    `) as unknown as unknown[]
    if (already.length > 0) return { posted: false, reason: 'already-posted-today' }

    // The SAME module Telegram and Discord render from, over the day that ENDED.
    const [stats, best, publishedTotal] = await Promise.all([
      getArchiveStatsForDay(day),
      getDayBest(day),
      getPublishedCount(),
    ])

    // No zero-day early return: renderXDaily reports a stood-down gate as the
    // fact it is. Skipping it silently made the account look dead on quiet days.
    const text = renderXDaily(
      buildDailyUpdate({
        day,
        stats,
        best,
        publishedTotal,
        url: `${SITE}/signals`,
        generatedAt: new Date().toISOString(),
      }),
    )

    // Manual mode: hand the digest over instead of posting it, and record it with
    // status 'manual' so the once-a-day idempotency still holds.
    if (postingMode() === 'manual') {
      if (!(await handOffToTelegram(text))) return { posted: false, reason: 'manual-handoff-failed', text }
      await db`
        INSERT INTO x_posts (kind, ref, text, tweet_id, status)
        VALUES ('digest', ${day}, ${text}, NULL, 'manual')
        ON CONFLICT ON CONSTRAINT x_posts_kind_ref_uniq DO NOTHING
      `
      return { posted: false, reason: 'manual', text }
    }

    const res = await postTweet(text)
    if (!res.ok) return { posted: false, reason: res.error }
    // Dry run: write nothing. The x_posts row is what makes the digest idempotent,
    // so recording a dry one would suppress the real digest for the whole day.
    if (res.dry) return { posted: false, reason: 'dry-run', text }

    await db`
      INSERT INTO x_posts (kind, ref, text, tweet_id, status)
      VALUES ('digest', ${day}, ${text}, ${res.id ?? null}, 'posted')
      ON CONFLICT ON CONSTRAINT x_posts_kind_ref_uniq DO NOTHING
    `
    return { posted: true, text }
  } catch (err) {
    console.error('[x-queue] digest failed:', err)
    return { posted: false, reason: String(err) }
  }
}

/** What the cron calls: drain receipts, then the digest if it is due. */
export async function runQueue(opts: { includeDigest?: boolean } = {}) {
  const receipts = await drainReceiptQueue()
  const digest = opts.includeDigest ?? digestDue() ? await postDailyDigest() : null
  return { receipts, digest }
}