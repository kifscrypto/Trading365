// Discord webhook notifier — mirrors the scanner's Telegram alerts into the
// Discord VIP channel with styled, colour-coded embeds. Reads DISCORD_WEBHOOK_URL
// (no-op if unset, exactly like the Telegram helpers no-op without a token).
//
// SAFETY: every exported function swallows its own errors. A Discord failure
// must NEVER break the Telegram send or abort a scanner cron.

const COLORS = {
  short: 0xe53935, // red
  long: 0x2e9e4f, // green
  win: 0x2e9e4f, // green
  loss: 0xe53935, // red
  stats: 0xf1c40f, // gold
} as const

type Embed = Record<string, unknown>

async function post(embeds: Embed[], content?: string, webhookUrl?: string): Promise<void> {
  const url = webhookUrl ?? process.env.DISCORD_WEBHOOK_URL
  if (!url) return
  // When several scanner crons fire in the same slot they hammer one webhook and
  // Discord replies 429. Honour retry_after and try once more so a message
  // (notably the daily digest) isn't silently dropped in the burst.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Trading365 Scanner', content, embeds }),
      })
      if (res.ok) return
      if (res.status === 429 && attempt === 0) {
        const body = await res.json().catch(() => ({}) as { retry_after?: number })
        const retryAfter = Number(body?.retry_after) || 2
        console.error(`[discord] webhook 429, retrying after ${retryAfter}s`)
        await new Promise((r) => setTimeout(r, (retryAfter + 0.5) * 1000))
        continue
      }
      console.error('[discord] webhook error:', res.status, await res.text())
      return
    } catch (err) {
      console.error('[discord] send failed:', err)
      return
    }
  }
}

export interface DiscordTarget {
  label: string // "TP1"
  price: string // preformatted, no $ prefix
  pct: string // "-1.5%" / "+1.5%"
}

export interface DiscordSignal {
  direction: 'short' | 'long'
  symbol: string
  exchangeLabel: string
  score: number
  rawScore: number
  entry: string // preformatted price
  stopPrice: string // preformatted price
  stopPct: string // "+2.0%" (short) / "-2.9%" (long)
  targets: DiscordTarget[]
  signals: string
  tradeText: string
  tradeUrl: string
}

// Styled entry-signal embed — red for shorts, green for longs, TPs stacked.
export async function discordSignal(s: DiscordSignal): Promise<void> {
  try {
    const isShort = s.direction === 'short'
    const marketLine = isShort ? '📉 Market: BEARISH ✅' : '📈 Market: BULLISH ✅'
    const embed: Embed = {
      color: isShort ? COLORS.short : COLORS.long,
      title: `${isShort ? '🔴' : '🟢'} ${isShort ? 'SHORT' : 'LONG'} SIGNAL — $${s.symbol}`,
      description: `**📊 Score:** ${s.score} (${s.rawScore})   •   **🏦 ${s.exchangeLabel}**   •   ${marketLine}`,
      fields: [
        { name: '💲 Entry', value: `$${s.entry}`, inline: true },
        { name: '🛑 Stop', value: `$${s.stopPrice} (${s.stopPct})`, inline: true },
        {
          name: '🎯 Targets',
          value: s.targets.map((t) => `${t.label}: \`$${t.price}\` (${t.pct})`).join('\n'),
          inline: false,
        },
        { name: '📋 Signals', value: s.signals || '—', inline: false },
        { name: '​', value: `⚡ **[${s.tradeText}](${s.tradeUrl})**`, inline: false },
      ],
      footer: { text: `Trading365 Scanner • ${isShort ? 'Short' : 'Long'}` },
      timestamp: new Date().toISOString(),
    }
    await post([embed])
  } catch (err) {
    console.error('[discord] discordSignal failed:', err)
  }
}

// TP-hit / stopped-out outcome embed — green for a win, red for a stop.
export async function discordOutcome(opts: {
  win: boolean
  title: string
  lines?: string[]
  tradeText?: string
  tradeUrl?: string
}): Promise<void> {
  try {
    const embed: Embed = {
      color: opts.win ? COLORS.win : COLORS.loss,
      title: opts.title,
      footer: { text: 'Trading365 Scanner • Outcome' },
      timestamp: new Date().toISOString(),
    }
    const desc = (opts.lines ?? []).filter(Boolean).join('\n')
    if (desc) embed.description = desc
    if (opts.tradeText && opts.tradeUrl) {
      embed.fields = [{ name: '​', value: `⚡ **[${opts.tradeText}](${opts.tradeUrl})**`, inline: false }]
    }
    await post([embed])
  } catch (err) {
    console.error('[discord] discordOutcome failed:', err)
  }
}

export interface DiscordSideStats {
  tp1WinRate: number | null
  directionalAccuracy: number | null
  totalSignals: number
  signalsConfirmed: number
  avgMove: number | null
}

const pct = (n: number | null, digits = 1) => (n == null ? '—' : `${n.toFixed(digits)}%`)
const signed = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)

export interface DiscordRecentWin {
  side: 'short' | 'long'
  symbol: string
  pctChange: number
}

export interface DiscordDigest {
  shortHitRate: number | null
  shortFired: number
  longHitRate: number | null
  longFired: number
  pnlReturnPct: number // combined book return %, e.g. +51.5
  pnlBalance: number // combined book balance, e.g. 1515
  pnlWins: number
  pnlTrades: number
  recentWins: DiscordRecentWin[]
}

// Gold daily digest — Signal Hit Rate + Simulated P&L + Recent Wins.
export async function discordDigest(d: DiscordDigest): Promise<void> {
  try {
    const winsList =
      d.recentWins.length > 0
        ? d.recentWins
            .slice(0, 8)
            .map(
              (w) =>
                `${w.side === 'short' ? '🔴' : '🟢'} **$${w.symbol}** ${w.pctChange > 0 ? '+' : ''}${w.pctChange.toFixed(1)}%`,
            )
            .join('\n')
        : '—'
    const embed: Embed = {
      color: COLORS.stats,
      title: '📊 Daily Scanner Report',
      fields: [
        { name: '🎯 Signal Hit Rate', value: `🔴 Short **${pct(d.shortHitRate)}** (${d.shortFired})\n🟢 Long **${pct(d.longHitRate)}** (${d.longFired})`, inline: true },
        { name: '💰 Simulated P&L', value: `**${signed(d.pnlReturnPct)}**\n$1,000 → $${Math.round(d.pnlBalance).toLocaleString()}\n${d.pnlWins}/${d.pnlTrades} wins`, inline: true },
        { name: '🔥 Recent Wins', value: winsList, inline: false },
      ],
      footer: { text: 'Trading365 • trading365.org/scanner' },
      timestamp: new Date().toISOString(),
    }
    await post([embed])
  } catch (err) {
    console.error('[discord] discordDigest failed:', err)
  }
}

export interface DiscordArticle {
  title: string
  excerpt: string
  url: string
  image?: string | null
  category?: string | null
}

// New-article announcement embed — posts to the SEPARATE public articles webhook
// (DISCORD_ARTICLES_WEBHOOK_URL), not the VIP signals one. No-op if unset.
export async function discordArticle(a: DiscordArticle): Promise<void> {
  try {
    const webhook = process.env.DISCORD_ARTICLES_WEBHOOK_URL
    if (!webhook) return
    const embed: Embed = {
      color: 0x1e88e5, // blue
      title: a.title,
      url: a.url,
      description: a.excerpt || undefined,
      footer: { text: a.category ? `Trading365 • ${a.category}` : 'Trading365' },
      timestamp: new Date().toISOString(),
    }
    if (a.image) {
      const img = a.image.startsWith('http')
        ? a.image
        : `https://trading365.org${a.image.startsWith('/') ? '' : '/'}${a.image}`
      embed.image = { url: img }
    }
    await post([embed], '📰 **New article published**', webhook)
  } catch (err) {
    console.error('[discord] discordArticle failed:', err)
  }
}

// Plain-text version of the daily digest for Telegram (HTML parse_mode).
export function digestTelegramText(d: DiscordDigest): string {
  const wins =
    d.recentWins.length > 0
      ? d.recentWins
          .slice(0, 8)
          .map((w) => `${w.side === 'short' ? '🔴' : '🟢'} $${w.symbol} ${w.pctChange > 0 ? '+' : ''}${w.pctChange.toFixed(1)}%`)
          .join('\n')
      : '—'
  return (
    '<b>' +
    [
      '📊 DAILY SCANNER REPORT',
      '',
      '🎯 Signal Hit Rate:',
      `   🔴 Short: ${pct(d.shortHitRate)} (${d.shortFired})`,
      `   🟢 Long: ${pct(d.longHitRate)} (${d.longFired})`,
      '',
      '💰 Simulated P&L:',
      `   ${signed(d.pnlReturnPct)}  ($1,000 → $${Math.round(d.pnlBalance).toLocaleString()})`,
      `   ${d.pnlWins}/${d.pnlTrades} wins`,
      '',
      '🔥 Recent Wins:',
      wins,
      '',
      '⚡ trading365.org/scanner',
    ].join('\n') +
    '</b>'
  )
}

// Gold performance-digest embed — the same numbers shown on /live.
export async function discordStats(short: DiscordSideStats, long: DiscordSideStats): Promise<void> {
  try {
    const embed: Embed = {
      color: COLORS.stats,
      title: '📊 Scanner Performance',
      fields: [
        { name: '🔴 Short Hit Rate', value: `**${pct(short.tp1WinRate)}**  (${short.signalsConfirmed} fired)`, inline: true },
        { name: '🟢 Long Hit Rate', value: `**${pct(long.tp1WinRate)}**  (${long.signalsConfirmed} fired)`, inline: true },
        { name: '​', value: '​', inline: false },
        { name: '🎯 Directional', value: `Short ${pct(short.directionalAccuracy)} · Long ${pct(long.directionalAccuracy)}`, inline: true },
        { name: '📈 Avg Move', value: `Short ${signed(short.avgMove)} · Long ${signed(long.avgMove)}`, inline: true },
        { name: '🔢 Tracked', value: `${short.totalSignals} short · ${long.totalSignals} long`, inline: false },
      ],
      footer: { text: 'Trading365 • live at trading365.org/scanner' },
      timestamp: new Date().toISOString(),
    }
    await post([embed])
  } catch (err) {
    console.error('[discord] discordStats failed:', err)
  }
}
