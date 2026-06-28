import { NextResponse } from 'next/server'
import { getScannerStats, getScannerRecentWins } from '@/lib/scanner-stats'
import { computePnl } from '@/lib/scanner-pnl'
import { discordDigest, digestTelegramText, type DiscordDigest } from '@/lib/discord'

// Daily scanner report — Signal Hit Rate + Recent Wins + Simulated P&L, pushed
// to BOTH the Discord VIP channel (styled embed) and the Telegram channel.
// Trigger it on a daily cron the same way as the other scanner routes
// (?cron=true, or Bearer CRON_SECRET, or an authed admin session).

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[daily-digest] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('[daily-digest] telegram error:', JSON.stringify(await res.json()))
  } catch (err) {
    console.error('[daily-digest] telegram send failed:', err)
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const auth = request.headers.get('authorization')
  const cookies = request.headers.get('cookie') ?? ''
  const hasSession = cookies.split(';').some((c) => c.trim().startsWith('admin_auth='))
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [shortStats, longStats, shortWins, longWins, pnl] = await Promise.all([
    getScannerStats('short'),
    getScannerStats('long'),
    getScannerRecentWins('short', 8),
    getScannerRecentWins('long', 8),
    computePnl(),
  ])

  const recentWins = [...shortWins, ...longWins]
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    .slice(0, 8)
    // Show the FAVOURABLE (profit) move as positive: a short profits when price
    // falls, so its negative pct_change is flipped to a positive gain.
    .map((w) => ({
      side: w.side,
      symbol: w.symbol.replace(/USDT$/, ''),
      pctChange: w.side === 'short' ? -w.pctChange : w.pctChange,
    }))

  const digest: DiscordDigest = {
    shortHitRate: shortStats.tp1WinRate,
    shortFired: shortStats.signalsConfirmed,
    longHitRate: longStats.tp1WinRate,
    longFired: longStats.signalsConfirmed,
    pnlReturnPct: pnl.combined.returnPct,
    pnlBalance: pnl.combined.balance,
    pnlWins: pnl.combined.wins,
    pnlTrades: pnl.combined.trades,
    recentWins,
  }

  await discordDigest(digest)
  await sendTelegram(digestTelegramText(digest))

  return NextResponse.json({ ok: true, digest })
}
