import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines, weex1hKlines, bitunix1hKlines,
  calcRSI, calcMACD, setupSignalTables, EXCHANGE_LABEL,
  type Kline, type SqlClient,
} from '@/app/api/scanner/_core'
import { exchangeTradeLink } from '@/app/api/scanner/_config'

// Long entry trigger — parallel to /api/scanner/entries, inverted for longs.
// Reads the long watchlist, fires only in a BULLISH-BTC ('hostile') regime, and
// alerts on bullish 1H entry triggers. Fired alerts are recorded in a SEPARATE
// telegram_alerts_long table so the short monitor cron (short-only TP logic) is
// never fed long rows. Existing short scanner code is untouched.

const SIGNAL_DISPLAY: Record<string, string> = {
  above_200ema:        '>200EMA',
  above_50ema:         '>50EMA',
  golden_cross:        'Golden X',
  macd_bull:           'MACD Bull',
  macd_hist_pos:       'MACD Hist+',
  rsi_building:        'RSI Build',
  vol_above_avg:       'Vol ✓',
  vol_rising_up:       'Vol Rising',
  higher_lows:         'HL',
  higher_highs:        'HH',
  ema50_tight:         'EMA50 ✓✓',
  ema50_near:          'EMA50 ✓',
  funding_squeeze:     'Fund Sqz',
  funding_low:         'Fund Low',
  d_above_200ema:      'D >200EMA',
  d_higher_lows:       'D HL',
  rsi_bull_div:        'RSI Div',
  macd_1h_cross_bull:  'MACD 1H ✓',
  rsi_1h_rising:       'RSI 1H ↑',
  bullish_engulf:      'Bull Engulf',
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

// --- 1H bullish entry triggers (inverted from the short route) ---

function checkMACDCrossBull(klines: Kline[]): boolean {
  if (klines.length < 36) return false
  const closes = klines.map(k => parseFloat(k[4]))
  const { macd: mNow,  signal: sNow  } = calcMACD(closes)
  const { macd: mPrev, signal: sPrev } = calcMACD(closes.slice(0, -1))
  // Bullish cross: was below or equal, now above
  return mPrev <= sPrev && mNow > sNow
}

function checkRSIRising(klines: Kline[]): boolean {
  if (klines.length < 20) return false
  const closes  = klines.map(k => parseFloat(k[4]))
  const rsiNow  = calcRSI(closes)
  const rsiPrev = calcRSI(closes.slice(0, -3))
  return rsiNow > 40 && rsiNow > rsiPrev
}

function checkBullishEngulfing(klines: Kline[]): boolean {
  if (klines.length < 2) return false
  const last = klines[klines.length - 1]
  const prev = klines[klines.length - 2]
  const lastOpen  = parseFloat(last[1]), lastClose = parseFloat(last[4])
  const prevOpen  = parseFloat(prev[1]), prevClose = parseFloat(prev[4])
  return prevClose < prevOpen        // prev candle bearish
    && lastClose > lastOpen          // current candle bullish
    && lastOpen  <= prevClose        // current opens below prev close
    && lastClose >= prevOpen         // current closes above prev open
}

function swingLow(klines: Kline[], lookback = 10): number {
  return Math.min(...klines.slice(-lookback).map(k => parseFloat(k[3])))
}

// --- Telegram (single premium channel, same as the short route now does) ---

async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[long-entries/sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) console.error('[long-entries/sendTelegram] API error:', JSON.stringify(json))
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
      CREATE TABLE IF NOT EXISTS telegram_alerts_long (
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
        direction        VARCHAR(10) DEFAULT 'long',
        triggered_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await setupSignalTables(sql as SqlClient)

    // Most recent long watchlist (within the last 5h to cover timing gaps)
    const watchlist = await sql`
      SELECT DISTINCT ON (symbol, exchange)
        symbol, exchange, score, adjusted_score,
        signals, market_condition, price
      FROM scanner_long_watchlist
      WHERE created_at > NOW() - INTERVAL '5 hours'
      ORDER BY symbol, exchange, created_at DESC
    `

    console.log(`[long-entries] watchlist: ${watchlist.length} symbols found`)

    if (watchlist.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: 'watchlist empty' })
    }

    // Hard regime gate — longs ONLY fire when the BTC regime is 'hostile' (bullish BTC).
    const marketCondition = (watchlist[0].market_condition as string) ?? 'neutral'
    if (marketCondition !== 'hostile') {
      console.log(`[Long Scanner] Regime gate: ${marketCondition} — suppressing all long signals`)
      return NextResponse.json({
        ok:                   true,
        checked:               watchlist.length,
        triggered:             0,
        suppressed_by_regime:  marketCondition,
      })
    }

    const triggered: string[] = []

    for (let i = 0; i < watchlist.length; i += 10) {
      const batch = watchlist.slice(i, i + 10)

      const klineResults = await Promise.allSettled(
        batch.map(item => {
          if (item.exchange === 'hyperliquid') return hyperliquid1hKlines((item.symbol as string).replace('USDT', ''))
          if (item.exchange === 'mexc')        return mexcKlines((item.symbol as string).replace('USDT', '_USDT'), 'Min60', 105)
          if (item.exchange === 'weex')        return weex1hKlines('cmt_' + (item.symbol as string).toLowerCase())
          if (item.exchange === 'bitunix')     return bitunix1hKlines(item.symbol as string)
          return okx1hKlines((item.symbol as string).replace('USDT', '-USDT-SWAP'))
        })
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const sym  = item.symbol as string

        if (klineResults[j].status !== 'fulfilled') continue
        const klines = (klineResults[j] as PromiseFulfilledResult<Kline[]>).value
        if (klines.length < 36) continue

        const macdCross = checkMACDCrossBull(klines)
        const rsiRising = checkRSIRising(klines)
        const engulfing = checkBullishEngulfing(klines)
        const firedCount = [macdCross, rsiRising, engulfing].filter(Boolean).length
        console.log(`[long-entries] ${sym} 1H triggers — MACD bull cross:${macdCross} RSI rising:${rsiRising} Bull engulf:${engulfing} → firedCount:${firedCount}`)

        if (firedCount < 2) continue

        const entrySignals: string[] = []
        if (macdCross) entrySignals.push('macd_1h_cross_bull')
        if (rsiRising) entrySignals.push('rsi_1h_rising')
        if (engulfing) entrySignals.push('bullish_engulf')

        const entryPrice    = parseFloat(klines[klines.length - 1][4])
        const stopPrice     = swingLow(klines)
        const adjustedScore = (item.adjusted_score ?? item.score ?? 0) as number
        const displaySymbol = sym.replace('USDT', '')

        if (adjustedScore >= 7) {
          // Dedup: skip if already alerted this symbol (long) in the last 4h
          const recent = await sql`
            SELECT id FROM telegram_alerts_long
            WHERE  symbol    = ${sym}
              AND  exchange  = ${item.exchange as string}
              AND  triggered_at > NOW() - INTERVAL '4 hours'
            LIMIT 1
          `
          if (recent.length > 0) continue

          await sql`
            INSERT INTO telegram_alerts_long
              (symbol, exchange, entry_price, stop_price, score, adjusted_score, signals, entry_signals, market_condition, direction)
            VALUES (
              ${sym}, ${item.exchange as string},
              ${entryPrice}, ${stopPrice},
              ${item.score as number}, ${adjustedScore},
              ${JSON.stringify(item.signals)}::jsonb,
              ${JSON.stringify(entrySignals)}::jsonb,
              ${item.market_condition as string},
              'long'
            )
          `

          const exchange      = item.exchange as string
          const exchangeLabel = EXCHANGE_LABEL[exchange] ?? 'OKX'
          const tradeLink     = exchangeTradeLink(exchange, sym)
          const allSignalKeys = [...(item.signals as string[]), ...entrySignals]
          const signalStr     = allSignalKeys.map(s => SIGNAL_DISPLAY[s] ?? s).join(', ')

          const tp1 = entryPrice * 1.015
          const tp2 = entryPrice * 1.025
          const tp3 = entryPrice * 1.04
          const rawScore = item.score as number
          const div = '━━━━━━━━━━━━━━━━━━'

          const text = [
            div,
            '🟢 LONG SIGNAL',
            div,
            '',
            `💰 <b>$${displaySymbol}</b>`,
            `📊 Score: ${adjustedScore} (${rawScore})`,
            `🏦 Exchange: ${exchangeLabel}`,
            '📈 Market: BULLISH ✅',
            '',
            `💲 Entry: $${fmtPrice(entryPrice)}`,
            '',
            '🎯 Targets:',
            `   TP1: $${fmtPrice(tp1)} (+1.5%)`,
            `   TP2: $${fmtPrice(tp2)} (+2.5%)`,
            `   TP3: $${fmtPrice(tp3)} (+4.0%)`,
            '',
            `🛑 Stop: $${fmtPrice(stopPrice)} (last swing low)`,
            '',
            `📋 Signals: ${signalStr}`,
            '',
            `🔗 Trade now: ${tradeLink}`,
            '',
            '⚡ trading365.org/scanner/longs',
            div,
          ].join('\n')

          await sendTelegram(text)
          triggered.push(displaySymbol)
        } else {
          // Below threshold — log to scanner_signals (direction='long') without alerting
          const recentSignal = await sql`
            SELECT id FROM scanner_signals
            WHERE  symbol    = ${sym}
              AND  exchange  = ${item.exchange as string}
              AND  direction = 'long'
              AND  scanned_at > NOW() - INTERVAL '4 hours'
            LIMIT 1
          `
          if (recentSignal.length > 0) continue

          const allSignals     = [...(item.signals as string[]), ...entrySignals]
          const signalsLiteral = `{${allSignals.map(s => `"${s}"`).join(',')}}`

          await sql`
            INSERT INTO scanner_signals
              (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition, direction)
            VALUES (
              ${sym}, ${item.exchange as string},
              ${entryPrice},
              ${adjustedScore}, ${item.score as number},
              ${signalsLiteral}::text[],
              ${item.market_condition as string},
              'long'
            )
          `
        }
      }
    }

    return NextResponse.json({
      ok:        true,
      direction: 'long',
      checked:   watchlist.length,
      triggered: triggered.length,
      symbols:   triggered,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[long-entries]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
