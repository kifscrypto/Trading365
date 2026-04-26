import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines,
  calcRSI, calcMACD, setupSignalTables,
  type Kline, type SqlClient,
} from '@/app/api/scanner/_core'

// Human-readable labels for Telegram alert
const SIGNAL_DISPLAY: Record<string, string> = {
  lower_highs:      'LH ✓✓',
  weak_lower_highs: 'LH ✓',
  heavy_bear_vol:   'Vol Bear ✓✓',
  bear_vol:         'Vol Bear ✓',
  high_funding:     'Fund ↑↑↑',
  pos_funding:      'Fund ↑↑',
  slight_funding:   'Fund ↑',
  rsi_ob:           'RSI OB',
  rsi_div:          'RSI Div',
  macd_bear:        'MACD Bear',
  macd_zero:        'MACD <0',
  d_200ema:         'D 200EMA',
  d_lh:             'D LH',
  macd_1h_cross:    'MACD 1H ✗',
  rsi_1h_falling:   'RSI 1H ↓',
  bearish_engulf:   'Bear Engulf',
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

// --- 1H signal checks ---

function checkMACDCross(klines: Kline[]): boolean {
  if (klines.length < 36) return false
  const closes  = klines.map(k => parseFloat(k[4]))
  const { macd: mNow,  signal: sNow  } = calcMACD(closes)
  const { macd: mPrev, signal: sPrev } = calcMACD(closes.slice(0, -1))
  // Bearish cross: was above or equal, now below
  return mPrev >= sPrev && mNow < sNow
}

function checkRSIFalling(klines: Kline[]): boolean {
  if (klines.length < 20) return false
  const closes  = klines.map(k => parseFloat(k[4]))
  const rsiNow  = calcRSI(closes)
  const rsiPrev = calcRSI(closes.slice(0, -3))
  return rsiNow < 60 && rsiNow < rsiPrev
}

function checkBearishEngulfing(klines: Kline[]): boolean {
  if (klines.length < 2) return false
  const last = klines[klines.length - 1]
  const prev = klines[klines.length - 2]
  const lastOpen  = parseFloat(last[1]), lastClose = parseFloat(last[4])
  const prevOpen  = parseFloat(prev[1]), prevClose = parseFloat(prev[4])
  return prevClose > prevOpen        // prev candle bullish
    && lastClose < lastOpen          // current candle bearish
    && lastOpen  >= prevClose        // current opens above prev close
    && lastClose <= prevOpen         // current closes below prev open
}

function swingHigh(klines: Kline[], lookback = 10): number {
  return Math.max(...klines.slice(-lookback).map(k => parseFloat(k[2])))
}

// --- Telegram ---

async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    console.error('[sendTelegram] API error:', JSON.stringify(json))
  } else {
    console.log('[sendTelegram] sent ok to', chatId)
  }
}

// --- Route ---

export async function GET(request: Request) {
  const url     = new URL(request.url)
  const isCron  = url.searchParams.get('cron') === 'true'
  const auth    = request.headers.get('authorization')
  const cookies = request.headers.get('cookie') ?? ''
  const hasSession = cookies.split(';').some(c => c.trim().startsWith('admin_auth='))
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = neon(process.env.DATABASE_URL!)

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS telegram_alerts (
        id               SERIAL PRIMARY KEY,
        symbol           TEXT        NOT NULL,
        exchange         TEXT        NOT NULL,
        entry_price      NUMERIC,
        stop_price       NUMERIC,
        score            INTEGER,
        adjusted_score   INTEGER,
        signals          JSONB       DEFAULT '[]',
        entry_signals    JSONB       DEFAULT '[]',
        market_condition TEXT,
        triggered_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await setupSignalTables(sql as SqlClient)

    // Fetch most recent watchlist (within the last 5h to cover timing gaps)
    const watchlist = await sql`
      SELECT DISTINCT ON (symbol, exchange)
        symbol, exchange, score, adjusted_score,
        signals, market_condition, price
      FROM scanner_watchlist
      WHERE created_at > NOW() - INTERVAL '5 hours'
      ORDER BY symbol, exchange, created_at DESC
    `

    if (watchlist.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: 'watchlist empty' })
    }

    const triggered: string[] = []

    // Process in batches of 10
    for (let i = 0; i < watchlist.length; i += 10) {
      const batch = watchlist.slice(i, i + 10)

      const klineResults = await Promise.allSettled(
        batch.map(item => {
          if (item.exchange === 'hyperliquid') {
            const coin = (item.symbol as string).replace('USDT', '')
            return hyperliquid1hKlines(coin)
          }
          if (item.exchange === 'mexc') {
            // BTCUSDT → BTC_USDT
            const mexcSym = (item.symbol as string).replace('USDT', '_USDT')
            return mexcKlines(mexcSym, 'Min60', 105)
          }
          // OKX: BTCUSDT → BTC-USDT-SWAP
          const instId = (item.symbol as string).replace('USDT', '-USDT-SWAP')
          return okx1hKlines(instId)
        })
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        if (klineResults[j].status !== 'fulfilled') continue
        const klines = (klineResults[j] as PromiseFulfilledResult<Kline[]>).value
        if (klines.length < 36) continue

        const macdCross   = checkMACDCross(klines)
        const rsiFalling  = checkRSIFalling(klines)
        const engulfing   = checkBearishEngulfing(klines)
        const firedCount  = [macdCross, rsiFalling, engulfing].filter(Boolean).length

        if (firedCount < 2) continue

        const entrySignals: string[] = []
        if (macdCross)  entrySignals.push('macd_1h_cross')
        if (rsiFalling) entrySignals.push('rsi_1h_falling')
        if (engulfing)  entrySignals.push('bearish_engulf')

        const entryPrice    = parseFloat(klines[klines.length - 1][4])
        const stopPrice     = swingHigh(klines)
        const adjustedScore = item.adjusted_score as number
        const displaySymbol = (item.symbol as string).replace('USDT', '')

        if (adjustedScore >= 6) {
          // Deduplicate: skip if already alerted this symbol in the last 4h
          const recent = await sql`
            SELECT id FROM telegram_alerts
            WHERE  symbol    = ${item.symbol as string}
              AND  exchange  = ${item.exchange as string}
              AND  triggered_at > NOW() - INTERVAL '4 hours'
            LIMIT 1
          `
          if (recent.length > 0) continue

          await sql`
            INSERT INTO telegram_alerts
              (symbol, exchange, entry_price, stop_price, score, adjusted_score, signals, entry_signals, market_condition)
            VALUES (
              ${item.symbol as string}, ${item.exchange as string},
              ${entryPrice}, ${stopPrice},
              ${item.score as number}, ${adjustedScore},
              ${JSON.stringify(item.signals)}::jsonb,
              ${JSON.stringify(entrySignals)}::jsonb,
              ${item.market_condition as string}
            )
          `

          const exchangeLabel = item.exchange === 'hyperliquid' ? 'Hyperliquid'
                              : item.exchange === 'mexc'        ? 'MEXC'
                              : 'OKX'
          const allSignalKeys = [...(item.signals as string[]), ...entrySignals]
          const signalStr     = allSignalKeys.map(s => SIGNAL_DISPLAY[s] ?? s).join(', ')

          const text = [
            `🔴 SHORT SIGNAL — $${displaySymbol}`,
            `Exchange: ${exchangeLabel}`,
            `Score: ${adjustedScore}/15`,
            `Entry: $${fmtPrice(entryPrice)}`,
            `Stop: above $${fmtPrice(stopPrice)} (last swing high)`,
            `Signals: ${signalStr}`,
            `Market: ${(item.market_condition as string).toUpperCase()}`,
          ].join('\n')

          await sendTelegram(text)
          triggered.push(displaySymbol)
        } else {
          // Below threshold — log to scanner_signals without alerting
          const recentSignal = await sql`
            SELECT id FROM scanner_signals
            WHERE  symbol    = ${item.symbol as string}
              AND  exchange  = ${item.exchange as string}
              AND  scanned_at > NOW() - INTERVAL '4 hours'
            LIMIT 1
          `
          if (recentSignal.length > 0) continue

          const allSignals     = [...(item.signals as string[]), ...entrySignals]
          const signalsLiteral = `{${allSignals.map(s => `"${s}"`).join(',')}}`

          await sql`
            INSERT INTO scanner_signals
              (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition)
            VALUES (
              ${item.symbol as string}, ${item.exchange as string},
              ${entryPrice},
              ${adjustedScore}, ${item.score as number},
              ${signalsLiteral}::text[],
              ${item.market_condition as string}
            )
          `
        }
      }
    }

    return NextResponse.json({
      ok:        true,
      checked:   watchlist.length,
      triggered: triggered.length,
      symbols:   triggered,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[entries]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
