/**
 * Discord daily snapshot — the I/O half. The embed itself, and the reason these
 * two files are split, live in lib/discord-snapshot-format.ts.
 *
 * WHAT IT IS FOR. Telegram and X announce individual signals as they resolve;
 * nothing published the day's aggregate. This posts one embed per UTC day at
 * ~00:05 summarising the day that just ended, on a SEPARATE webhook
 * (DISCORD_SNAPSHOT_WEBHOOK_URL) so it never competes for the VIP signal
 * channel's rate limit.
 *
 * NUMBERS. Every figure comes from getArchiveStatsForDay() / getDayBest() in
 * lib/signals/public.ts — the same module, and the same aggregate expressions,
 * that the /signals archive header uses. There is deliberately no second
 * calculation here: if the archive header and this embed ever disagree, that is a
 * bug in one shared function rather than a drift between two.
 *
 * HONESTY RULES, same as Telegram: losses are counted and shown; a day with no
 * signals still posts, because silence reads as a broken bot and a zero is a true
 * statement about a selective gate; no field promises a return.
 *
 * FAILURE CONTAINMENT. Every exported function catches its own errors and returns
 * a result object, so a Discord outage or a missing webhook can never throw into
 * a cron. Nothing in the firing path imports this file.
 */
import { neon } from '@neondatabase/serverless'
import { getArchiveStatsForDay, getDayBest, SITE } from '@/lib/signals/public'
import { post } from '@/lib/discord'
import { buildSnapshotEmbed, type SnapshotEmbed } from '@/lib/discord-snapshot-format'

const db = neon(process.env.DATABASE_URL!)

/**
 * One row per UTC day. This is what makes the snapshot idempotent: the row IS the
 * record that the day was posted, so a retried or overlapping cron cannot produce
 * a second embed. Same guard shape as x_posts (a unique key on the period).
 *
 * Created here rather than in a migration because that is the precedent set by
 * setupXPostsTable in lib/x-queue.ts.
 */
export async function setupSnapshotTable(): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS discord_snapshots (
      day        TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      payload    JSONB NOT NULL,
      status     TEXT NOT NULL DEFAULT 'posted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export interface SnapshotResult {
  posted: boolean
  day: string
  reason?: string
  /** HTTP status from the webhook, when one was attempted. */
  webhookStatus?: number
  embed?: SnapshotEmbed
}

/** The UTC day that has just ended — what the 00:05 cron should report on. */
export function previousUtcDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
}

export async function postDailySnapshot(day: string): Promise<SnapshotResult> {
  try {
    await setupSnapshotTable()

    const already = (await db`
      SELECT 1 FROM discord_snapshots WHERE day = ${day} LIMIT 1
    `) as unknown as unknown[]
    if (already.length > 0) return { posted: false, day, reason: 'already-posted' }

    const [stats, best] = await Promise.all([getArchiveStatsForDay(day), getDayBest(day)])
    const embed = buildSnapshotEmbed(day, stats, best, SITE)

    const url = process.env.DISCORD_SNAPSHOT_WEBHOOK_URL
    if (!url) {
      // Nothing to send to. Return the embed so a caller can still inspect it, and
      // write NO row: recording the day here would suppress the real snapshot for
      // the rest of it once the webhook is configured.
      return { posted: false, day, reason: 'no-webhook-configured', embed }
    }

    // One attempt, plus lib/discord's single 429 retry — deliberately not a retry
    // loop. A failing webhook is logged and the day is left UNRECORDED, so the
    // next cron run or a manual call can still deliver it.
    const res = await post([embed], undefined, url)
    if (!res.ok) {
      console.error(`[discord-snapshot] webhook failed for ${day}: status ${res.status}`)
      return { posted: false, day, reason: `webhook-${res.status}`, webhookStatus: res.status, embed }
    }

    await db`
      INSERT INTO discord_snapshots (day, title, payload, status)
      VALUES (${day}, ${embed.title}, ${JSON.stringify(embed)}::jsonb, 'posted')
      ON CONFLICT (day) DO NOTHING
    `
    return { posted: true, day, webhookStatus: res.status, embed }
  } catch (err) {
    console.error('[discord-snapshot] failed:', err)
    return { posted: false, day, reason: String(err) }
  }
}
