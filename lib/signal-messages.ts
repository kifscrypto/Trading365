/**
 * Message templates for the posting layer — Telegram (fired + close) and X.
 *
 * WHY A SEPARATE MODULE
 * The four routes that post (entries / long-entries / monitor / long-monitor) each
 * built their message inline as a `.join('\n')` over a literal array. Two books ×
 * two lifecycle stages × four outcome shapes meant the same copy existed in six
 * places, so any wording change was a six-file edit and the shapes could drift
 * apart. This module is the single source of truth for the TEXT only.
 *
 * WHAT THIS MODULE IS NOT
 * It computes nothing about a trade. Prices, tiers, stops and percentages all
 * arrive pre-computed from the caller, which is why the scanner's scoring,
 * gating, monitoring and TP/SL maths are untouched by the template rewrite. Every
 * function here is pure: same input, same string, no clock, no I/O, no globals —
 * so `scripts/x-preview.mjs` can render every shape without a database.
 *
 * ARROWS AND SPACING ARE PART OF THE SPEC. The line breaks in the Telegram shapes
 * are deliberate: Telegram renders them literally, and the trust footer is
 * wrapped by hand so it breaks in the same place on every client instead of
 * wherever the reader's font happens to run out.
 */

export type MsgSide = 'long' | 'short'

/**
 * Gain banked by closing at each tier. Identical for both books by construction:
 * a short's TP1 is a −1.5% price move and a +1.5% gain, a long's is +1.5% and
 * +1.5%. The receipt tiers (SHORT_TIERS / LONG_TIERS in lib/signals/public.ts)
 * carry the same numbers as `pct`; this table exists so the message layer needs no
 * import and cannot disagree with itself.
 */
export const TIER_GAIN_PCT: Record<number, number> = { 1: 1.5, 2: 2.5, 3: 4.0, 4: 6.0, 5: 8.0 }

/** Tier levels that get the "big win" treatment rather than the standard win. */
export const BIG_WIN_LEVELS = new Set([4, 5])

export function sideUpper(side: MsgSide): string {
  return side === 'short' ? 'SHORT' : 'LONG'
}

/** '+1.5%' from a level. */
export function tierPct(level: number): string {
  const p = TIER_GAIN_PCT[level]
  return p === undefined ? '' : `+${p.toFixed(1)}%`
}

/**
 * 'HOLDING_TIME' — how long the trade took to reach the target.
 *
 * The exact touch time is not recorded anywhere (the monitor sees it on its next
 * 15-minute pass and compares candle extremes), so this is the elapsed time from
 * fire to the pass that detected it. It therefore rounds to the monitor's cadence
 * and is a slight OVER-estimate by up to one cycle. Labelled honestly rather than
 * dressed up: the alternative is claiming a precision the pipeline does not have.
 */
export function fmtDuration(hours: number | null | undefined): string {
  if (hours == null || !isFinite(hours) || hours < 1) return 'under an hour'
  const totalMin = Math.round(hours * 60)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

// ── Telegram: close posts (monitor + long-monitor) ──────────────────────────

/** '-2.4%' — always negative, from a positive stop distance. */
export function lossPct(distancePct: number): string {
  const n = Math.abs(Number(distancePct))
  return `-${isFinite(n) ? n.toFixed(1) : '0.0'}%`
}

export interface OutcomeMessageInput {
  kind: 'win' | 'bigwin' | 'loss'
  side: MsgSide
  pair: string
  timeframe: string
  exchange: string
  entry: string
  /** win / bigwin */
  level?: number
  holdingHours?: number | null
  /** loss */
  lossDistancePct?: number
  receiptUrl: string | null
}

/**
 * Three shapes, one function, because they must be mutually exclusive by
 * construction — the whole point of the LOSS format is that it is produced by the
 * same code path as a win, so it cannot quietly get dropped or reworded later.
 *
 *   ✅ TP1 HIT — +1.5%            🏆 TP4 — +6.0%            🔻 STOPPED — -2.4%
 */
export function buildOutcomeTelegram(i: OutcomeMessageInput): string {
  const head = `${i.pair} ${sideUpper(i.side)} · ${i.timeframe} · ${i.exchange}`

  if (i.kind === 'loss') {
    const lines = [
      `🔻 STOPPED — ${lossPct(i.lossDistancePct ?? 0)}`,
      head,
      '',
      'We post these too. Every signal — wins and',
      'losses — is in the public archive, timestamped',
      'at fire time. Nothing deleted, nothing curated.',
    ]
    if (i.receiptUrl) lines.push(i.receiptUrl)
    return lines.join('\n')
  }

  const level = i.level ?? 1
  const label = `TP${level}`
  const pct = tierPct(level)

  if (i.kind === 'bigwin') {
    const lines = [
      `🏆 ${label} — ${pct}`,
      head,
      '',
      `Called at ${i.entry}. Ran the full ladder.`,
    ]
    lines.push(i.receiptUrl ? `Full receipt: ${i.receiptUrl}` : 'Full receipt in the archive.')
    return lines.join('\n')
  }

  const lines = [
    `✅ ${label} HIT — ${pct}`,
    head,
    '',
    `Entry ${i.entry} → target reached in ${fmtDuration(i.holdingHours)}`,
  ]
  // Only TP1 carries the runner line — by TP2 the runner is no longer "still live
  // toward TP2", so the clause is omitted rather than reworded.
  if (level === 1) lines.push('Runner still live toward TP2.')
  lines.push('')
  lines.push('📋 Signal was public before it hit:')
  if (i.receiptUrl) lines.push(i.receiptUrl)
  return lines.join('\n')
}

// ── X templates (manual cross-post + the automated queue) ───────────────────

export interface XSignalInput {
  kind: 'win' | 'bigwin' | 'loss' | 'fired'
  side: MsgSide
  pair: string
  timeframe: string
  exchange: string
  entry: string
  /** win / bigwin */
  level?: number
  /** loss */
  lossDistancePct?: number
  /** fired */
  tp1?: string
  stop?: string
  receiptUrl: string | null
}

/** Fallback when a link is unavailable — a bare domain, not a broken link. */
const ARCHIVE = 'trading365.org/signals'

export function buildXTweet(i: XSignalInput): string {
  // NO LINK BY DEFAULT — see receiptLinks() in lib/x.ts.
  //
  // X charges materially more for a post containing a URL, and a receipt does not
  // need one: the post already states the result, and the archive link is carried
  // by the daily digest, which is the post actually trying to bring someone to
  // the site. This used to fall back to a bare `trading365.org/signals` whenever
  // the receipt URL was missing, so EVERY receipt was a link post regardless.
  //
  // Each lead-in that would otherwise dangle after a colon is reworded. And every
  // line break of the linked version is preserved, so turning the flag back on
  // reproduces today's posts byte for byte rather than silently reformatting them.
  const url = i.receiptUrl

  if (i.kind === 'loss') {
    return [
      'We post these too.',
      `${i.pair} ${sideUpper(i.side)} stopped ${lossPct(i.lossDistancePct ?? 0)}. Wins and losses,`,
      url ? 'timestamped at fire time. No curation:' : 'published at fire time. No curation.',
      ...(url ? [url] : []),
    ].join('\n')
  }

  if (i.kind === 'bigwin') {
    const level = i.level ?? 4
    return [
      `🏆 TP${level} — ${tierPct(level)} on ${i.pair} ${sideUpper(i.side)}.`,
      url ? `Called at ${i.entry}. Full receipt:` : `Called at ${i.entry}. Full receipt in the archive.`,
      ...(url ? [url] : []),
    ].join('\n')
  }

  if (i.kind === 'fired') {
    return [
      `⚡ ${sideUpper(i.side)} fired: ${i.pair} · ${i.timeframe} · entry ${i.entry}`,
      `TP1 ${i.tp1 ?? '—'} / SL ${i.stop ?? '—'}. Result lands in the`,
      url ? `archive either way: ${url}` : 'archive either way.',
    ].join('\n')
  }

  const level = i.level ?? 1
  return [
    `✅ ${i.pair} ${sideUpper(i.side)} — TP${level} ${tierPct(level)}`,
    `Entry ${i.entry} · ${i.timeframe} · ${i.exchange}`,
    url ? 'Timestamped before it happened:' : 'Timestamped before it happened.',
    ...(url ? [url] : []),
  ].join('\n')
}

export interface WeeklyDigestInput {
  signals: number
  tpCount: number
  /** Net expectancy per resolved signal, already net of the fee model. */
  avgNet: number | null
}

/**
 * Weekly aggregate. The `avg net` figure is the same expectancy the archive
 * headlines, so the post and the page can never quote different numbers.
 */
export function buildWeeklyDigestTweet(d: WeeklyDigestInput): string {
  const net = d.avgNet == null ? '—' : `${d.avgNet >= 0 ? '+' : ''}${d.avgNet.toFixed(2)}%`
  return [
    `📊 This week: ${d.signals} signals · ${d.tpCount} TP · ${net} avg net`,
    'Published at fire time. Nothing edited:',
    ARCHIVE,
  ].join('\n')
}

// ── Guard used by the preview script and the routes' self-checks ────────────

/**
 * True when a message contains no character that Telegram's HTML parse_mode
 * would reinterpret. The new templates carry no markup, but the routes still send
 * with `parse_mode: 'HTML'` (unchanged), so an injected value containing `<`, `>`
 * or `&` would make Telegram reject the whole message with a 400. Prices and pair
 * names cannot contain those, and the preview script asserts it on every shape so
 * a future template edit that introduces one fails loudly instead of silently
 * losing posts.
 */
export function isTelegramHtmlSafe(text: string): boolean {
  return !/[<>&]/.test(text)
}


// ── Telegram: fired post (entries + long-entries) ────────────────────────────

export interface FiredTiers {
  label: string   // 'TP1'
  price: string   // pre-formatted
  pct: string     // '+1.5%'
}

export interface FiredMessageInput {
  side: MsgSide
  pair: string
  timeframe: string
  exchange: string
  entry: string
  tiers: FiredTiers[]
  stop: string
  /** null when the receipt row does not exist yet — the link line is omitted. */
  receiptUrl: string | null
}

/**
 * Shape (exact):
 *
 *   ⚡ NEW SIGNAL — SHORT
 *   BTW · 4H · MEXC
 *
 *   Entry: 0.7029
 *   TP1 0.6929 (-1.5%) · TP2 0.6853 (-2.5%) · TP3 0.6748 (-4.0%)
 *   SL 0.7284
 *
 *   📋 Published at fire time. This message and the archive
 *   entry can't be edited after the fact.
 *   https://trading365.org/signals/…
 *
 * The tier line is a single line for BOTH books — 3 tiers for shorts, 5 for
 * longs, same shape. Five tiers run to roughly 100 characters, which Telegram
 * wraps at spaces on a phone; splitting it into two lines would make the short
 * and long books look like different products for no gain.
 */
export function buildFiredTelegram(i: FiredMessageInput): string {
  const lines = [
    `⚡ NEW SIGNAL — ${sideUpper(i.side)}`,
    `${i.pair} · ${i.timeframe} · ${i.exchange}`,
    '',
    `Entry: ${i.entry}`,
    i.tiers.map((t) => `${t.label} ${t.price} (${t.pct})`).join(' · '),
    `SL ${i.stop}`,
    '',
    '📋 Published at fire time. This message and the archive',
    "entry can't be edited after the fact.",
  ]
  // The link is the last line and is simply absent when there is no receipt —
  // the post still goes out rather than being held or broken.
  if (i.receiptUrl) lines.push(i.receiptUrl)
  return lines.join('\n')
}

