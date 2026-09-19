/**
 * The pure half of the Discord daily snapshot: build an embed from numbers.
 *
 * WHY THIS IS A SEPARATE MODULE. It has to be loadable by plain node so
 * scripts/discord-snapshot.mjs can render a real embed without a bundler. node's
 * ESM resolver requires an explicit extension on relative imports, while the
 * project's tsconfig (moduleResolution "bundler", no allowImportingTsExtensions)
 * forbids '.ts' extensions in TS files — the two cannot both be satisfied by one
 * module that imports at runtime. So this file imports NOTHING at runtime: its
 * only import is `import type`, which node erases before resolution.
 *
 * The I/O half (reading the database, posting to the webhook, the idempotency
 * guard) lives in lib/discord-snapshot.ts and uses the normal '@/' aliases.
 *
 * NUMBERS COME FROM ELSEWHERE. This module never queries anything. Every figure
 * is passed in from getArchiveStatsForDay() / getDayBest() in lib/signals/public.ts
 * — the same aggregate expressions the /signals archive header uses.
 */
import type { ArchiveDayStats } from './signals/public'

/** Discord's embed limits. */
export const EMBED_LIMITS = {
  title: 256,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  total: 6000,
} as const

export const SNAPSHOT_FOOTER = (site: string) =>
  `Every signal published at fire time · Full record: ${site}/signals`

const COLOR = 0xf1c40f // gold — the same colour as the existing performance digest

export interface DayBestRow {
  symbol: string
  side: 'long' | 'short'
  status: string
  movePct: number
}

const pair = (symbol: string) => symbol.replace(/USDT$/, '')
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

export interface SnapshotField {
  name: string
  value: string
  inline: boolean
}

/**
 * A type alias, not an interface, on purpose: lib/discord.ts's `post()` takes
 * `Record<string, unknown>[]`, and an interface (which can be augmented) is not
 * assignable to that while an object type alias is.
 */
export type SnapshotEmbed = {
  color: number
  title: string
  description?: string
  fields?: SnapshotField[]
  footer: { text: string }
}

/**
 * The embed for one UTC day.
 *
 * `Avg move` is netExpectancy — the archive header's "Net expectancy / signal",
 * the only one of the archive's two figures that is net of fees. The header's
 * other figure, "Avg move / winner", is gross and is not what this line claims.
 */
export function buildSnapshotEmbed(
  day: string,
  stats: ArchiveDayStats,
  best: DayBestRow | null,
  site: string,
): SnapshotEmbed {
  const title = `📊 Daily Snapshot — ${day} UTC`
  const footer = { text: SNAPSHOT_FOOTER(site) }

  // A zero day is still a post. The gate standing the book down is a fact worth
  // reporting; going quiet just looks like the bot died.
  if (stats.fired === 0) {
    return {
      color: COLOR,
      title,
      description: `No signals cleared the bar today — the gate stood the book down. Full record: ${site}/signals`,
      footer,
    }
  }

  const fields: SnapshotField[] = [
    {
      name: 'Signals fired',
      value: `${stats.fired} (${stats.firedBySide.long} long · ${stats.firedBySide.short} short)`,
      inline: true,
    },
    {
      name: 'TP hits',
      value: `${stats.wins} · Stopped: ${stats.losses} · Expired: ${stats.expired}`,
      inline: true,
    },
    {
      name: 'Hit rate',
      value: stats.hitRate != null ? `${stats.hitRate.toFixed(1)}%` : '—',
      inline: true,
    },
    {
      name: 'Avg move',
      value: stats.netExpectancy != null ? `${signed(stats.netExpectancy)} net of fees` : '— net of fees',
      inline: true,
    },
  ]

  if (best) {
    fields.push({
      name: 'Best',
      value: `${pair(best.symbol)} ${best.side.toUpperCase()} ${best.status.toUpperCase()} (${signed(best.movePct)})`,
      inline: false,
    })
  }

  return { color: COLOR, title, fields, footer }
}
