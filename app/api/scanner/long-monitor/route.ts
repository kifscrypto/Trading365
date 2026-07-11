import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines, weex1hKlines, bitunix1hKlines,
  EXCHANGE_LABEL,
  type Kline,
} from '@/app/api/scanner/_core'
import { exchangeReferralUrl } from '@/app/api/scanner/_config'
import { discordOutcome } from '@/lib/discord'

// Real-time TP-touch monitor for already-alerted LONG signals — mirror of the
// short monitor (/api/scanner/monitor).
//
// The long-entries cron alerts a LONG with TP1/TP2/TP3 at entry × 1.015 / 1.025
// / 1.04 and a stop below entry. This cron watches the live klines of each open
// long alert and, the moment a TP price is actually touched (candle high ≥ TP),
// broadcasts a confirmation to Telegram — once per TP level. If the stop is
// breached first (candle low ≤ stop) it marks the signal stopped and stops
// watching, so we never announce a "win" that only happened after a stop-out.
// Writes closed_at + tp_result so the live Closed panel shows longs in real time.

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

async function sendTelegram(text: string, button?: { text: string; url: string }): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[long-monitor/sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (button) body.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    console.error('[long-monitor/sendTelegram] API error:', JSON.stringify(json))
  }
}

function fetchKlines(symbol: string, exchange: string): Promise<Kline[]> {
  if (exchange === 'hyperliquid') return hyperliquid1hKlines(symbol.replace('USDT', ''))
  if (exchange === 'mexc')        return mexcKlines(symbol.replace('USDT', '_USDT'), 'Min60', 105)
  if (exchange === 'weex')        return weex1hKlines('cmt_' + symbol.toLowerCase())
  if (exchange === 'bitunix')     return bitunix1hKlines(symbol)
  return okx1hKlines(symbol.replace('USDT', '-USDT-SWAP'))
}

// TP levels (long): entry ABOVE by these fractions.
const TP_FRACTIONS = [
  { level: 1, mult: 1.015, label: '+1.5%' },
  { level: 2, mult: 1.025, label: '+2.5%' },
  { level: 3, mult: 1.04,  label: '+4.0%' },
] as const

export async function GET(request: Request) {
  const url     = new URL(request.url)
  const isCron  = url.searchParams.get('cron') === 'true'
  // dry — compute only (no Telegram, no DB writes). seed — write flags to current
  // reality but send NO Telegram (run once after deploy so only FUTURE touches alert).
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
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS tp1_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS tp2_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS tp3_alerted BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS stopped BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS tp_result TEXT`
    // Max favourable excursion — for a long the favourable extreme is the highest
    // high. Accumulated as GREATEST each cycle (mirror of the short monitor).
    await sql`ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS mfe_pct FLOAT`

    // One-time back-fill for longs already flagged before these columns existed.
    if (doWrite) {
      await sql`
        UPDATE telegram_alerts_long
        SET closed_at = triggered_at,
            tp_result = CASE WHEN tp3_alerted THEN 'TP3' WHEN tp2_alerted THEN 'TP2'
                             WHEN tp1_alerted THEN 'TP1' WHEN stopped THEN 'SL' END
        WHERE closed_at IS NULL AND (tp1_alerted OR tp2_alerted OR tp3_alerted OR stopped)
      `
    }

    const open = await sql`
      SELECT id, symbol, exchange, entry_price, stop_price,
             EXTRACT(EPOCH FROM triggered_at) * 1000 AS triggered_ms,
             tp1_alerted, tp2_alerted, tp3_alerted
      FROM   telegram_alerts_long
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
        let maxHigh = -Infinity // favourable extreme for a long (price rising)

        for (const k of candles) {
          const high = parseFloat(k[2])
          const low  = parseFloat(k[3])
          if (high > maxHigh) maxHigh = high
          // Long stop is BELOW entry — breached when price falls to it.
          if (stop && low <= stop) { stoppedOut = true; break }
          for (const tp of TP_FRACTIONS) {
            const tpPrice = entry * tp.mult
            // Long TP is ABOVE entry — reached when price rises to it.
            if (high >= tpPrice && !already[tp.level] && !newlyHit.includes(tp)) {
              newlyHit.push(tp)
            }
          }
        }

        // Persist the running peak favourable move (long → high above entry).
        const mfePct = maxHigh > -Infinity ? Math.max(0, ((maxHigh - entry) / entry) * 100) : null
        if (doWrite && mfePct !== null) {
          await sql`UPDATE telegram_alerts_long SET mfe_pct = GREATEST(COALESCE(mfe_pct, 0), ${mfePct}) WHERE id = ${a.id as number}`
        }

        const displaySymbol = (a.symbol as string).replace('USDT', '')
        const exchange      = a.exchange as string
        const exchangeLabel = EXCHANGE_LABEL[exchange] ?? 'OKX'

        if (newlyHit.length > 0) {
          const hitLabels = newlyHit.map(tp => `TP${tp.level} (${tp.label})`).join(' & ')
          const best      = newlyHit[newlyHit.length - 1] // deepest TP reached this run
          const deepestLevel = Math.max(
            best.level,
            already[3] ? 3 : already[2] ? 2 : already[1] ? 1 : 0,
          )
          const text = [
            `✅ TARGET HIT — $${displaySymbol}`,
            `Exchange: ${exchangeLabel}`,
            `Long entry: $${fmtPrice(entry)}`,
            `Reached: ${hitLabels}`,
            `Target price: $${fmtPrice(entry * best.mult)}`,
            `Signal confirmed 🎯`,
          ].join('\n')
          if (doSend) {
            await sendTelegram(text, { text: `Trade ${displaySymbol} on ${exchangeLabel}`, url: exchangeReferralUrl(exchange) })
            await discordOutcome({
              win: true,
              title: text.split('\n')[0],
              lines: text.split('\n').slice(1),
              tradeText: `Trade ${displaySymbol} on ${exchangeLabel}`,
              tradeUrl: exchangeReferralUrl(exchange),
            })
          }
          if (doWrite) {
            await sql`
              UPDATE telegram_alerts_long SET
                tp1_alerted = tp1_alerted OR ${newlyHit.some(t => t.level === 1)},
                tp2_alerted = tp2_alerted OR ${newlyHit.some(t => t.level === 2)},
                tp3_alerted = tp3_alerted OR ${newlyHit.some(t => t.level === 3)},
                closed_at   = NOW(),
                tp_result   = ${'TP' + deepestLevel}
              WHERE id = ${a.id as number}
            `
          }
          confirmed.push(`${displaySymbol}:${hitLabels}`)
        }

        if (stoppedOut) {
          if (doWrite) {
            await sql`
              UPDATE telegram_alerts_long SET
                stopped   = TRUE,
                closed_at = COALESCE(closed_at, NOW()),
                tp_result = COALESCE(tp_result, 'SL')
              WHERE id = ${a.id as number}
            `
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
    console.error('[long-monitor]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
