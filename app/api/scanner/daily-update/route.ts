import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { verifyAdmin } from '@/lib/auth'
import { getArchiveStatsForDay, getDayBest, getPublishedCount, SITE } from '@/lib/signals/public'
import { post as discordPost } from '@/lib/discord'
import {
  buildDailyUpdate,
  previousUtcDay,
  renderTelegramDaily,
  renderDiscordDaily,
  renderXDaily,
  X_MAX_CHARS,
} from '@/lib/daily-update'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * THE daily update — one cron, one set of numbers, every surface.
 *
 *   /api/scanner/daily-update?cron=true                  → yesterday's complete UTC day
 *   /api/scanner/daily-update?cron=true&day=2026-09-20   → an explicit day
 *   /api/scanner/daily-update?cron=true&force=true       → re-send even if recorded
 *   /api/scanner/daily-update?cron=true&dry=true         → render, send nothing, record nothing
 *
 * WHY ONE ROUTE. This replaces two crons that described the same day differently:
 * /api/scanner/daily-digest (13:03 UTC, getScannerStats — a rolling window) and
 * /api/scanner/discord-snapshot (00:05 UTC, getArchiveStatsForDay — a UTC day).
 * Telegram and Discord could therefore disagree about the same 24 hours, and the
 * Discord one fired at 3am local time. Both are now this route at 08:00 UTC.
 *
 * X is rendered here too (renderXDaily) but NOT sent — lib/x-queue.ts owns X
 * delivery, including its daily cap and its own idempotency. Returning the text
 * means the X work is a wiring change, not another formatter.
 *
 * THE DAY REPORTED IS THE DAY THAT ENDED. At 08:00 UTC this reports the previous
 * complete UTC day, which is the only window where every signal has had a chance
 * to resolve. Reporting the in-progress day would quote a hit rate that keeps
 * changing after publication.
 */

const db = neon(process.env.DATABASE_URL!)

/**
 * Per-surface idempotency, so a retried or overlapping cron cannot double-post,
 * AND a partial failure (Telegram sent, Discord webhook down) can be completed by
 * the next run without re-sending the surface that already worked.
 *
 * Created here rather than in a migration, following the precedent set by
 * setupXPostsTable in lib/x-queue.ts.
 */
async function setupDailyUpdatesTable(): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS daily_updates (
      day          TEXT PRIMARY KEY,
      telegram_ok  BOOLEAN NOT NULL DEFAULT FALSE,
      discord_ok   BOOLEAN NOT NULL DEFAULT FALSE,
      payload      JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

/** The UTC day that has just ended — now shared from lib/daily-update.ts. */

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[daily-update] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID')
    return false
  }
  // One retry on 429 only. The other scanner crons fire in the same slot and a
  // burst can trip Telegram's per-chat limit; the daily post is not worth losing
  // to that, and a second attempt is enough for the window to clear.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      })
      if (res.ok) return true
      const body = await res.json().catch(() => ({}))
      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(body?.parameters?.retry_after) || 2
        console.error(`[daily-update] telegram 429, retrying after ${retryAfter}s`)
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000))
        continue
      }
      console.error('[daily-update] telegram error:', JSON.stringify(body))
      return false
    } catch (err) {
      console.error('[daily-update] telegram send failed:', err)
      return false
    }
  }
  return false
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = url.searchParams.get('dry') === 'true'
  const force = url.searchParams.get('force') === 'true'
  const dayParam = url.searchParams.get('day')
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam ?? '') ? dayParam! : previousUtcDay()

  try {
    await setupDailyUpdatesTable()

    const prior = (await db`
      SELECT telegram_ok, discord_ok FROM daily_updates WHERE day = ${day} LIMIT 1
    `) as unknown as { telegram_ok: boolean; discord_ok: boolean }[]
    const alreadyTelegram = !force && !!prior[0]?.telegram_ok
    const alreadyDiscord = !force && !!prior[0]?.discord_ok

    // The day's numbers, from the SAME aggregates the /signals archive renders.
    const [stats, best, publishedTotal] = await Promise.all([
      getArchiveStatsForDay(day),
      getDayBest(day),
      getPublishedCount(),
    ])

    const update = buildDailyUpdate({
      day,
      stats,
      best,
      publishedTotal,
      url: `${SITE}/signals`,
      generatedAt: new Date().toISOString(),
    })

    const telegramText = renderTelegramDaily(update)
    const discordEmbed = renderDiscordDaily(update)
    const tweetText = renderXDaily(update)

    const result = {
      ok: true,
      day,
      dry,
      force,
      fired: update.fired,
      telegram: { sent: false, skipped: alreadyTelegram, chars: telegramText.length },
      discord: { sent: false, skipped: alreadyDiscord, status: 0 },
      x: { rendered: tweetText.length, withinLimit: tweetText.length <= X_MAX_CHARS },
      tweetText,
    }

    if (dry) return NextResponse.json(result)

    let telegramOk = alreadyTelegram
    let discordOk = alreadyDiscord

    if (!alreadyTelegram) {
      telegramOk = await sendTelegram(telegramText)
      result.telegram.sent = telegramOk
    }

    if (!alreadyDiscord) {
      // The dedicated daily webhook if one is configured, else the VIP channel
      // that lib/discord defaults to. Passing undefined lets post() fall back.
      const webhook = process.env.DISCORD_SNAPSHOT_WEBHOOK_URL || undefined
      const res = await discordPost([discordEmbed], undefined, webhook)
      discordOk = res.ok
      result.discord.sent = res.ok
      result.discord.status = res.status
    }

    // Record only what actually landed. A day where both surfaces failed stays
    // unrecorded, so the next run still tries rather than silently swallowing it.
    await db`
      INSERT INTO daily_updates (day, telegram_ok, discord_ok, payload)
      VALUES (${day}, ${telegramOk}, ${discordOk}, ${JSON.stringify(update)}::jsonb)
      ON CONFLICT (day) DO UPDATE SET
        telegram_ok = daily_updates.telegram_ok OR EXCLUDED.telegram_ok,
        discord_ok  = daily_updates.discord_ok  OR EXCLUDED.discord_ok,
        payload     = EXCLUDED.payload,
        updated_at  = NOW()
    `

    return NextResponse.json(result)
  } catch (err) {
    console.error('[daily-update] failed:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

