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
  SITE, STATUS_LABEL, displayPair, fmtPct, fmtPrice, fmtUtc, receiptUrl,
  type Receipt,
} from '@/lib/signals/public'
import {
  buildDigestTweet, buildReceiptTweet, choosePosts, maxPostsPerDay, postTweet,
  postingMode, type PostCandidate, type TweetSignal,
} from '@/lib/x'

const db = neon(process.env.DATABASE_URL!)

/** Signals older than this are not worth announcing. */
const MAX_AGE_HOURS = 24
/** Candidates pulled before the policy trims them. */
const CANDIDATE_POOL = 60

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

/** Receipt posts already made in the current UTC day, for the daily cap. */
export async function postsToday(): Promise<number> {
  const rows = (await db`
    SELECT COUNT(*)::int AS n FROM x_posts
    WHERE kind = 'receipt' AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
  `) as unknown as { n: number }[]
  return rows[0]?.n ?? 0
}

/** Unposted, fresh, live-origin receipts worth considering. */
export async function candidatePool(): Promise<(Receipt & PostCandidate)[]> {
  return (await db`
    SELECT *, ABS(COALESCE(move_pct, 0))::float AS abs_move
    FROM signal_receipts
    WHERE posted_to_x = FALSE
      AND origin = 'live'
      AND status <> 'fired'
      AND closed_at IS NOT NULL
      AND closed_at > NOW() - (${MAX_AGE_HOURS}::int * INTERVAL '1 hour')
    ORDER BY ABS(COALESCE(move_pct, 0)) DESC, closed_at DESC
    LIMIT ${CANDIDATE_POOL}
  `) as unknown as (Receipt & PostCandidate)[]
}

function toTweetSignal(r: Receipt): TweetSignal {
  return {
    pair: displayPair(r.symbol),
    side: r.side,
    outcome: r.status === 'expired' ? 'no target or stop hit in 48h' : `${STATUS_LABEL[r.status]} ${fmtPct(r.move_pct)}`,
    entry: fmtPrice(r.entry_price),
    timeframe: r.timeframe,
    exchange: r.exchange.toUpperCase(),
    firedOn: fmtUtc(r.fired_at, false),
    url: receiptUrl(r.public_id),
  }
}

export interface DrainResult {
  mode: string
  posted: string[]
  failed: string[]
  allowance: number
}

/**
 * Post up to the remaining daily allowance. Never throws — the same contract as
 * lib/discord.ts, because this runs from a cron.
 *
 * A post is only recorded (x_posts row + posted_to_x flag) AFTER the API call
 * succeeds, so a failure is retried on the next run rather than silently lost.
 */
export async function drainReceiptQueue(): Promise<DrainResult> {
  const out: DrainResult = { mode: postingMode(), posted: [], failed: [], allowance: 0 }
  try {
    await setupXPostsTable()
    const used = await postsToday()
    const allowance = Math.max(0, maxPostsPerDay() - used)
    out.allowance = allowance
    if (allowance === 0) return out

    const chosen = choosePosts(await candidatePool(), allowance)
    for (const r of chosen) {
      const text = buildReceiptTweet(toTweetSignal(r))
      const res = await postTweet(text)
      if (!res.ok) {
        out.failed.push(r.public_id)
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
      out.posted.push(r.public_id)
    }
  } catch (err) {
    console.error('[x-queue] drain failed:', err)
  }
  return out
}

/** True once the configured UTC hour has passed (the digest is a once-a-day post). */
export function digestDue(now: Date = new Date()): boolean {
  const hour = Number(process.env.X_DIGEST_HOUR_UTC ?? 20)
  return now.getUTCHours() >= (Number.isFinite(hour) ? hour : 20)
}

export interface DigestResult {
  posted: boolean
  reason?: string
  text?: string
}

/**
 * One aggregate post per UTC day. Idempotent on the date, so re-running the cron
 * cannot repeat it, and skipped entirely on days with no signals.
 */
export async function postDailyDigest(): Promise<DigestResult> {
  try {
    await setupXPostsTable()
    const day = new Date().toISOString().slice(0, 10)

    const already = (await db`
      SELECT 1 FROM x_posts WHERE kind = 'digest' AND ref = ${day} LIMIT 1
    `) as unknown as unknown[]
    if (already.length > 0) return { posted: false, reason: 'already-posted-today' }

    const [s] = (await db`
      SELECT
        COUNT(*) FILTER (WHERE fired_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))::int AS fired,
        COUNT(*) FILTER (WHERE closed_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND status LIKE 'tp%')::int AS wins,
        COUNT(*) FILTER (WHERE closed_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND status = 'sl')::int AS losses,
        (SELECT COUNT(*)::int FROM signal_receipts WHERE status <> 'fired') AS published
      FROM signal_receipts
    `) as unknown as { fired: number; wins: number; losses: number; published: number }[]

    if (!s || s.fired === 0) return { posted: false, reason: 'no-signals-today' }

    const resolved = s.wins + s.losses
    const text = buildDigestTweet({
      fired: s.fired,
      wins: s.wins,
      losses: s.losses,
      hitRate: resolved > 0 ? `${((s.wins / resolved) * 100).toFixed(1)}%` : null,
      published: s.published,
      url: `${SITE}/signals`,
    })

    const res = await postTweet(text)
    if (!res.ok) return { posted: false, reason: res.error }

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