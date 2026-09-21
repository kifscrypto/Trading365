/**
 * The daily update — ONE set of numbers, THREE renderings (Telegram, Discord, X).
 *
 * WHY THIS EXISTS
 * The daily post was previously built in four places with four shapes and three
 * different number sources: digestTelegramText() and discordDigest() in
 * lib/discord.ts, buildDigestTweet() in lib/x.ts, and buildSnapshotEmbed() in
 * lib/discord-snapshot-format.ts. Telegram quoted getScannerStats (a rolling
 * window) while the Discord snapshot quoted getArchiveStatsForDay (a UTC day), so
 * the same day could be described differently on two surfaces of the same site.
 *
 * This module takes the numbers ONCE and renders them per surface. Adding a
 * surface is now a renderer, not a fourth parallel implementation — which is what
 * makes X a first-class consumer rather than a copy.
 *
 * WHAT IT IS NOT
 * It computes nothing from the database and owns no I/O. Every figure arrives
 * pre-aggregated from getArchiveStatsForDay() / getDayBest() in
 * lib/signals/public.ts — the same expressions the /signals archive header uses,
 * so the post and the page cannot disagree. Every function is pure: same input,
 * same output, no clock, no globals.
 *
 * NO RUNTIME IMPORTS, deliberately. scripts/discord-snapshot.mjs renders a real
 * payload under plain node, and node's ESM resolver requires an explicit
 * extension on relative imports while tsconfig (moduleResolution "bundler", no
 * allowImportingTsExtensions) forbids '.ts' in TS files — the two cannot both be
 * satisfied by a module that imports at runtime. `import type` is erased before
 * resolution, so it is the only import allowed here.
 */
import type { ArchiveDayStats } from './signals/public'

// ── The update ──────────────────────────────────────────────────────────────

export interface DailyUpdateSide {
  fired: number
  resolved: number
  wins: number
  losses: number
  expired: number
  hitRate: number | null
  netExpectancy: number | null
}

export interface DailyUpdateBest {
  /** Display pair, 'CRV'. */
  pair: string
  side: 'long' | 'short'
  /** 'TP5' */
  label: string
  /** Realised move on the signal, signed. */
  movePct: number
}

export interface DailyUpdate {
  /** ISO UTC date, YYYY-MM-DD — the day being reported. */
  day: string
  fired: number
  /** Still unresolved at the end of the day. Reported, never hidden. */
  open: number
  resolved: number
  wins: number
  losses: number
  expired: number
  hitRate: number | null
  netExpectancy: number | null
  netSamples: number
  feeModelVersion: string
  netRoundTripPct: number
  long: DailyUpdateSide
  short: DailyUpdateSide
  best: DailyUpdateBest | null
  /** All-time published count, for the trust line. */
  publishedTotal: number
  url: string
  generatedAt: string
}

// ── Shared formatting ───────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * 'Mon 21 Sep 2026' from 'YYYY-MM-DD', computed by hand rather than via Intl.
 *
 * This module's contract is same-input-same-output. Intl's short month names are
 * ICU-dependent — node renders September as "Sept" in en-GB while older ICU in a
 * serverless runtime renders "Sep" — so the same post could read differently
 * depending on where it ran. A lookup table cannot drift.
 */
export function fmtDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '')
  if (!m) return day ?? ''
  const [, y, mo, d] = m
  const monthIdx = Number(mo) - 1
  const date = new Date(Date.UTC(Number(y), monthIdx, Number(d)))
  if (isNaN(date.getTime()) || monthIdx < 0 || monthIdx > 11) return day
  return `${DAYS[date.getUTCDay()]} ${Number(d)} ${MONTHS[monthIdx]} ${y}`
}

/** '+0.84%' / '-0.31%'. Always signed — a bare number reads as a claim. */
export function signedPct(n: number | null, digits = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

/** '71.2%' or an em dash. */
export function plainPct(n: number | null, digits = 1): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function count(n: number): string {
  return (n ?? 0).toLocaleString('en-US')
}

/**
 * Escape a value before it goes into Telegram's HTML parse_mode. Symbols and
 * statuses cannot contain these today, but an unescaped `&` makes Telegram reject
 * the entire message with a 400 — and a daily post is not worth losing to a
 * punctuation mark.
 */
function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const RULE = '────────────────'

// ── Telegram ────────────────────────────────────────────────────────────────

/**
 * The Telegram daily update. HTML parse_mode.
 *
 * THE OLD SHAPE WRAPPED THE WHOLE MESSAGE IN <b>. Every line was bold, so nothing
 * was — headings, numbers and footnotes all carried the same weight and the post
 * read as one undifferentiated block. This gives each section a heading, promotes
 * only the figure that matters, and demotes the caveats to <i> so the eye can
 * skip them without losing them.
 */
export function renderTelegramDaily(u: DailyUpdate): string {
  const head = [
    '📊 <b>TRADING365 — DAILY UPDATE</b>',
    `<i>${esc(fmtDay(u.day))} · the complete UTC day</i>`,
  ]

  // A zero day is still posted. The gate standing the book down is a fact worth
  // reporting; going quiet looks like the bot died.
  if (u.fired === 0) {
    return [
      ...head,
      '',
      '<b>No signals cleared the bar.</b>',
      '<i>The regime gate stood both books down for the day — no setup met the bar.</i>',
      '',
      RULE,
      `📋 <b>${count(u.publishedTotal)}</b> signals published, never edited`,
      esc(u.url),
    ].join('\n')
  }

  const lines: string[] = [...head, '']

  lines.push('⚡ <b>SIGNALS</b>')
  lines.push(`<b>${u.fired}</b> fired · ${u.long.fired} long · ${u.short.fired} short`)
  lines.push(`${u.wins} hit a target · ${u.losses} stopped · ${u.expired} expired`)
  if (u.open > 0) lines.push(`<i>${u.open} still open when the day closed</i>`)
  lines.push('')

  lines.push('🎯 <b>HIT RATE</b>')
  lines.push(`<b>${plainPct(u.hitRate)}</b> <i>(${u.wins} of ${u.resolved} resolved)</i>`)
  lines.push('')

  lines.push('📈 <b>NET EXPECTANCY</b>')
  lines.push(`<b>${signedPct(u.netExpectancy)}</b> per signal <i>net of fees</i>`)
  lines.push(
    `<i>${esc(u.feeModelVersion)} · ${u.netRoundTripPct}% round trip · ${count(u.netSamples)} samples</i>`,
  )

  if (u.best) {
    lines.push('')
    lines.push('🏆 <b>BEST OF THE DAY</b>')
    lines.push(
      `${esc(u.best.pair)} ${u.best.side.toUpperCase()} → <b>${esc(u.best.label)} ${signedPct(u.best.movePct)}</b>`,
    )
  }

  lines.push('')
  lines.push(RULE)
  lines.push(`📋 <b>${count(u.publishedTotal)}</b> signals published, never edited`)
  lines.push(esc(u.url))
  lines.push('')
  lines.push('<i>Not financial advice.</i>')

  return lines.join('\n')
}

// ── Discord ─────────────────────────────────────────────────────────────────

export interface DiscordDailyField {
  name: string
  value: string
  inline: boolean
}

/**
 * A type alias, not an interface, on purpose: lib/discord.ts's `post()` takes
 * `Record<string, unknown>[]`, and an interface (which can be augmented) is not
 * assignable to that while an object type alias is.
 */
export type DiscordDailyEmbed = {
  color: number
  title: string
  description?: string
  fields?: DiscordDailyField[]
  footer: { text: string }
  timestamp?: string
}

/** Gold — the same accent the scanner's other embeds use. */
const DISCORD_GOLD = 0xf1c40f

/**
 * The Discord daily update.
 *
 * Discord embeds reward SHORT field values, so this leans on `inline: true` to
 * put three figures side by side and keeps prose out of the fields entirely. The
 * previous digest put a bulleted list of recent wins inside one field, which
 * pushed the numbers off screen on mobile — the day's actual result was the least
 * visible thing in it.
 */
export function renderDiscordDaily(u: DailyUpdate): DiscordDailyEmbed {
  const title = `📊 Daily Update — ${fmtDay(u.day)}`
  const footer = { text: `Every signal published at fire time · ${u.url}` }

  if (u.fired === 0) {
    return {
      color: DISCORD_GOLD,
      title,
      description:
        'No signals cleared the bar — the regime gate stood both books down. The record is unchanged.',
      footer,
    }
  }

  const fields: DiscordDailyField[] = [
    {
      name: '⚡ Fired',
      value: `**${u.fired}**\n${u.long.fired} long · ${u.short.fired} short`,
      inline: true,
    },
    {
      name: '🎯 Hit rate',
      value: `**${plainPct(u.hitRate)}**\n${u.wins} of ${u.resolved} resolved`,
      inline: true,
    },
    {
      name: '📈 Net expectancy',
      value: `**${signedPct(u.netExpectancy)}**\nper signal, after fees`,
      inline: true,
    },
    {
      name: 'Result split',
      value: `${u.wins} hit a target · ${u.losses} stopped · ${u.expired} expired`,
      inline: false,
    },
  ]

  if (u.open > 0) {
    fields.push({ name: 'Still open', value: `${u.open} unresolved when the day closed`, inline: false })
  }

  if (u.best) {
    fields.push({
      name: '🏆 Best of the day',
      value: `**${u.best.pair} ${u.best.side.toUpperCase()}** → ${u.best.label} (${signedPct(u.best.movePct)})`,
      inline: false,
    })
  }

  return {
    color: DISCORD_GOLD,
    title,
    description: `**${count(u.publishedTotal)}** signals published and counted, never edited.`,
    fields,
    footer,
    timestamp: u.generatedAt,
  }
}

// ── X ───────────────────────────────────────────────────────────────────────

/** X's hard limit, exposed so a caller can assert rather than discover it in prod. */
export const X_MAX_CHARS = 280

/**
 * The X daily update.
 *
 * Written to the 280 limit rather than truncated to it: the figures that matter
 * come first and the trust line last, so if this ever grows the thing that gets
 * dropped is the least load-bearing part. The URL is counted at X's t.co length
 * (23) rather than its literal length, which is what the API actually enforces.
 */
export function renderXDaily(u: DailyUpdate): string {
  // NOTE the double hole: match[0] is the whole string, so the captures start at
  // index 1. `[, mo, d]` would bind mo to the YEAR and d to the MONTH, which
  // rendered as "9 undefined" — caught by scripts/x-preview.mjs, not in prod.
  const [, , mo, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(u.day ?? '') ?? []
  const stamp = mo && d ? `${Number(d)} ${MONTHS[Number(mo) - 1]}` : u.day

  if (u.fired === 0) {
    return [
      `📊 ${stamp}: no signals cleared the bar.`,
      'The regime gate stood both books down.',
      '',
      `${count(u.publishedTotal)} signals published, never edited:`,
      u.url,
    ].join('\n')
  }

  const lines = [
    `📊 ${stamp}: ${u.fired} signals fired`,
    `✅ ${u.wins} hit a target · 🛑 ${u.losses} stopped`,
    `🎯 Hit rate ${plainPct(u.hitRate)}`,
    `📈 Net ${signedPct(u.netExpectancy)} per signal, after fees`,
  ]
  if (u.best) lines.push(`🏆 Best: ${u.best.pair} ${u.best.side.toUpperCase()} ${u.best.label} ${signedPct(u.best.movePct)}`)
  lines.push('')
  lines.push(`${count(u.publishedTotal)} signals published, never edited:`)
  lines.push(u.url)

  return lines.join('\n')
}


export interface DailyUpdateInput {
  day: string
  stats: ArchiveDayStats
  best: { symbol: string; side: 'long' | 'short'; status: string; movePct: number } | null
  publishedTotal: number
  url: string
  generatedAt: string
}

/** 'CRVUSDT' → 'CRV'. Same rule as the archive and the snapshot used. */
export function displayPair(symbol: string): string {
  return (symbol ?? '').replace(/USDT$/, '')
}

/** 'tp5' → 'TP5'. Anything unrecognised falls back to the raw status, uppercased. */
export function tierLabel(status: string): string {
  return (status ?? '').toUpperCase()
}

function side(s: ArchiveDayStats['long'] | ArchiveDayStats['short'], fired: number): DailyUpdateSide {
  return {
    fired,
    resolved: s?.resolved ?? 0,
    wins: s?.wins ?? 0,
    losses: s?.losses ?? 0,
    expired: s?.expired ?? 0,
    hitRate: s?.hitRate ?? null,
    netExpectancy: s?.netExpectancy ?? null,
  }
}

/**
 * Fold the day's aggregate into one shape every surface renders from.
 *
 * The pooled figures are preferred over re-deriving them from the two sides: they
 * are the same pooled numbers the archive headlines, and a sum of two rounded
 * sides is not the same as the pooled value.
 */
export function buildDailyUpdate(i: DailyUpdateInput): DailyUpdate {
  const s = i.stats
  return {
    day: i.day,
    fired: s.fired,
    open: s.open,
    resolved: s.resolved,
    wins: s.wins,
    losses: s.losses,
    expired: s.expired,
    hitRate: s.hitRate,
    netExpectancy: s.netExpectancy,
    netSamples: s.netSamples,
    feeModelVersion: s.feeModelVersion,
    netRoundTripPct: s.netRoundTripPct,
    long: side(s.long, s.firedBySide?.long ?? 0),
    short: side(s.short, s.firedBySide?.short ?? 0),
    best: i.best
      ? {
          pair: displayPair(i.best.symbol),
          side: i.best.side,
          label: tierLabel(i.best.status),
          movePct: i.best.movePct,
        }
      : null,
    publishedTotal: i.publishedTotal,
    url: i.url,
    generatedAt: i.generatedAt,
  }
}

/**
 * The UTC day that has just ended — what an 08:00 UTC post reports on.
 *
 * Takes the clock as a parameter rather than reading it, so the module stays
 * pure and a caller can render a specific day deterministically. Shared by the
 * daily-update route and the X digest so both can never report different days.
 */
export function previousUtcDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
}
