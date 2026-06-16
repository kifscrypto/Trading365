import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines, weex1hKlines, bitunix1hKlines,
  exchangeTradeUrl, EXCHANGE_LABEL,
  type Kline,
} from '@/app/api/scanner/_core'

// Real-time TP-touch monitor for already-alerted short signals.
//
// The entries cron alerts a SHORT with TP1/TP2/TP3 at entry × 0.985 / 0.975 /
// 0.96 and a stop at the last swing high. This cron watches the live klines of
// each open alert and, the moment a TP price is actually touched (candle low ≤
// TP), broadcasts a confirmation to Telegram — once per TP level. If the stop
// is breached first it marks the signal stopped and stops watching, so we never
// announce a "win" that only happened after the trade was stopped out.

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

async function sendTelegram(text: string, chatIdOverride?: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = chatIdOverride ?? process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[monitor/sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    console.error('[monitor/sendTelegram] API error:', JSON.stringify(json))
  }
}

async function broadcast(text: string): Promise<void> {
  // Single premium channel (TELEGRAM_CHAT_ID = @ShortsScanner). No separate
  // premium broadcast — that would double-post to the same channel.
  await sendTelegram(text)
}

function fetchKlines(symbol: string, exchange: string): Promise<Kline[]> {
  if (exchange === 'hyperliquid') {
    return hyperliquid1hKlines(symbol.replace('USDT', ''))
  }
  if (exchange === 'mexc') {
    return mexcKlines(symbol.replace('USDT', '_USDT'), 'Min60', 105)
  }
  if (exchange === 'weex') {
    return weex1hKlines('cmt_' + symbol.toLowerCase())
  }
  if (exchange === 'bitunix') {
    return bitunix1hKlines(symbol)
  }
  return okx1hKlines(symbol.replace('USDT', '-USDT-SWAP'))
}

// TP levels (short): entry below by these fractions.
const TP_FRACTIONS = [
  { level: 1, mult: 0.985, label: '-1.5%' },
  { level: 2, mult: 0.975, label: '-2.5%' },
  { level: 3, mult: 0.96,  label: '-4.0%' },
] as const

export async function GET(request: Request) {
  const url     = new URL(request.url)
  const isCron  = url.searchParams.get('cron') === 'true'
  // dry  — compute only: no Telegram, no DB writes. Preview the back-fill:
  //        /api/scanner/monitor?dry=true
  // seed  — write the *_alerted/stopped flags to current reality but send NO
  //        Telegram. Run once after deploy so only FUTURE touches alert:
  //        /api/scanner/monitor?seed=true
  const dry     = url.searchParams.get('dry') === 'true'
  const seed    = url.searchParams.get('seed') === 'true'
  const doWrite = !dry
  const doSend  = !dry && !seed
  const auth    = request.headers.get('authorization')
  const cookies = request.headers.get('cookie') ?? ''
  const hasSession = cookies.split(';').some(c => c.trim().startsWith('admin_auth='))
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = neon(process.env.DATABASE_URL!)

  try {
    // One-time flags so each TP confirmation fires exactly once per signal.
    await sql`ALTER TABLE telegram_alerts ADD COLUMN IF NOT EXISTS tp1_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts ADD COLUMN IF NOT EXISTS tp2_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts ADD COLUMN IF NOT EXISTS tp3_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts ADD COLUMN IF NOT EXISTS stopped BOOLEAN DEFAULT FALSE`

    // Open alerts from the last 48h still worth watching (not stopped, not all
    // three TPs already confirmed).
    const open = await sql`
      SELECT id, symbol, exchange, entry_price, stop_price,
             EXTRACT(EPOCH FROM triggered_at) * 1000 AS triggered_ms,
             tp1_alerted, tp2_alerted, tp3_alerted
      FROM   telegram_alerts
      WHERE  triggered_at > NOW() - INTERVAL '48 hours'
        AND  stopped = FALSE
        AND  NOT (tp1_alerted AND tp2_alerted AND tp3_alerted)
      ORDER  BY triggered_at DESC
    `

    if (open.length === 0) {
      return NextResponse.json({ ok: true, watched: 0, confirmed: 0, note: 'nothing open' })
    }

    const confirmed: string[] = []
    let stoppedCount = 0

    for (let i = 0; i < open.length; i += 10) {
      const batch = open.slice(i, i + 10)
      const klineResults = await Promise.allSettled(
        batch.map(a => fetchKlines(a.symbol as string, a.exchange as string))
      )

      for (let j = 0; j < batch.length; j++) {
        const a = batch[j]
        if (klineResults[j].status !== 'fulfilled') continue
        const klines = (klineResults[j] as PromiseFulfilledResult<Kline[]>).value

        const entry       = Number(a.entry_price)
        const stop        = Number(a.stop_price)
        const triggeredMs = Number(a.triggered_ms)
        if (!entry) continue

        // Candles strictly after entry, oldest → newest, so we can detect
        // whether the stop was breached before a TP was reached.
        const candles = klines
          .filter(k => Number(k[0]) >= triggeredMs)
          .sort((x, y) => Number(x[0]) - Number(y[0]))

        const already = {
          1: a.tp1_alerted as boolean,
          2: a.tp2_alerted as boolean,
          3: a.tp3_alerted as boolean,
        }
        const newlyHit: (typeof TP_FRACTIONS)[number][] = []
        let stoppedOut = false

        for (const k of candles) {
          const high = parseFloat(k[2])
          const low  = parseFloat(k[3])
          if (stop && high >= stop) { stoppedOut = true; break }
          for (const tp of TP_FRACTIONS) {
            const tpPrice = entry * tp.mult
            if (low <= tpPrice && !already[tp.level] && !newlyHit.includes(tp)) {
              newlyHit.push(tp)
            }
          }
        }

        const displaySymbol = (a.symbol as string).replace('USDT', '')
        const exchange      = a.exchange as string
        const exchangeLabel = EXCHANGE_LABEL[exchange] ?? 'OKX'

        if (newlyHit.length > 0) {
          const hitLabels = newlyHit.map(tp => `TP${tp.level} (${tp.label})`).join(' & ')
          const best      = newlyHit[newlyHit.length - 1] // deepest TP reached this run
          const text = [
            `✅ TARGET HIT — $${displaySymbol}`,
            `Exchange: ${exchangeLabel}`,
            `Short entry: $${fmtPrice(entry)}`,
            `Reached: ${hitLabels}`,
            `Target price: $${fmtPrice(entry * best.mult)}`,
            `Signal confirmed 🎯`,
            `Trade on ${exchangeLabel}: ${exchangeTradeUrl(exchange, a.symbol as string)}`,
          ].join('\n')
          if (doSend) await broadcast(text)
          if (doWrite) {
            await sql`
              UPDATE telegram_alerts SET
                tp1_alerted = tp1_alerted OR ${newlyHit.some(t => t.level === 1)},
                tp2_alerted = tp2_alerted OR ${newlyHit.some(t => t.level === 2)},
                tp3_alerted = tp3_alerted OR ${newlyHit.some(t => t.level === 3)}
              WHERE id = ${a.id as number}
            `
          }
          confirmed.push(`${displaySymbol}:${hitLabels}`)
        }

        if (stoppedOut) {
          if (doWrite) {
            await sql`UPDATE telegram_alerts SET stopped = TRUE WHERE id = ${a.id as number}`
          }
          stoppedCount++
        }
      }
    }

    return NextResponse.json({
      ok:        true,
      mode:      dry ? 'dry' : seed ? 'seed' : 'live',
      watched:   open.length,
      confirmed: confirmed.length,
      hits:      confirmed,
      stopped:   stoppedCount,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[monitor]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
