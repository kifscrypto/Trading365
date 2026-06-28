import { discordArticle } from '@/lib/discord'

// Announce a freshly-published article to Discord (separate public articles
// webhook) and Telegram (reuses the signals chat). Error-isolated: a notify
// failure never breaks the publish request.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('[announce-article] telegram error:', JSON.stringify(await res.json()))
  } catch (err) {
    console.error('[announce-article] telegram send failed:', err)
  }
}

export interface AnnounceArticleInput {
  title: string
  excerpt: string
  url: string
  image?: string | null
  category?: string | null
}

export async function announceArticle(a: AnnounceArticleInput): Promise<void> {
  await discordArticle(a)

  const tgText =
    '<b>📰 New Article</b>\n\n' +
    `<b>${escapeHtml(a.title)}</b>\n` +
    (a.excerpt ? `${escapeHtml(a.excerpt)}\n` : '') +
    `\n${a.url}`
  await sendTelegram(tgText)
}
