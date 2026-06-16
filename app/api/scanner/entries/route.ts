import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines, weex1hKlines, bitunix1hKlines,
  calcRSI, calcMACD, setupSignalTables, EXCHANGE_LABEL,
  type Kline, type SqlClient,
} from '@/app/api/scanner/_core'
import { exchangeTradeLink } from '@/app/api/scanner/_config'

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

async function sendTelegram(text: string, chatIdOverride?: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = chatIdOverride ?? process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
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

    // Stage 1 — watchlist read
    console.log(`[entries] watchlist: ${watchlist.length} symbols found`)
    for (const w of watchlist) {
      console.log(`[entries]   ${w.symbol} (${w.exchange}) score=${w.score} adjusted=${w.adjusted_score}`)
    }

    if (watchlist.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: 'watchlist empty' })
    }

    // Hard regime gate — only fire signals when the BTC sentiment regime is favourable.
    // market_condition is computed by the watchlist builder and shared across all rows in a cycle.
    const marketCondition = (watchlist[0].market_condition as string) ?? 'neutral'
    if (marketCondition !== 'favourable') {
      console.log(`[Scanner] Regime gate: ${marketCondition} — suppressing all signals`)
      return NextResponse.json({
        ok:                   true,
        checked:               watchlist.length,
        triggered:             0,
        suppressed_by_regime:  marketCondition,
      })
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
          if (item.exchange === 'weex') {
            // BTCUSDT → cmt_btcusdt
            return weex1hKlines('cmt_' + (item.symbol as string).toLowerCase())
          }
          if (item.exchange === 'bitunix') {
            return bitunix1hKlines(item.symbol as string)
          }
          // OKX: BTCUSDT → BTC-USDT-SWAP
          const instId = (item.symbol as string).replace('USDT', '-USDT-SWAP')
          return okx1hKlines(instId)
        })
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const sym  = item.symbol as string

        // Stage 2 — kline fetch result
        if (klineResults[j].status !== 'fulfilled') {
          console.log(`[entries] ${sym} kline fetch FAILED:`, (klineResults[j] as PromiseRejectedResult).reason)
          continue
        }
        const klines = (klineResults[j] as PromiseFulfilledResult<Kline[]>).value
        if (klines.length < 36) {
          console.log(`[entries] ${sym} skipped — only ${klines.length} klines (need 36)`)
          continue
        }

        const macdCross   = checkMACDCross(klines)
        const rsiFalling  = checkRSIFalling(klines)
        const engulfing   = checkBearishEngulfing(klines)
        const firedCount  = [macdCross, rsiFalling, engulfing].filter(Boolean).length
        console.log(`[entries] ${sym} 1H triggers — MACD cross:${macdCross} RSI falling:${rsiFalling} Engulfing:${engulfing} → firedCount:${firedCount}`)

        if (firedCount < 2) continue

        const entrySignals: string[] = []
        if (macdCross)  entrySignals.push('macd_1h_cross')
        if (rsiFalling) entrySignals.push('rsi_1h_falling')
        if (engulfing)  entrySignals.push('bearish_engulf')

        const entryPrice    = parseFloat(klines[klines.length - 1][4])
        const stopPrice     = swingHigh(klines)
        const adjustedScore = (item.adjusted_score ?? item.score ?? 0) as number
        const displaySymbol = sym.replace('USDT', '')

        // Stage 3 — pre-Telegram score check
        console.log(`[entries] ${sym} PASSED firedCount threshold — adjustedScore=${adjustedScore} threshold=7 → will alert: ${adjustedScore >= 7}`)

        if (adjustedScore >= 7) {
          // Deduplicate: skip if already alerted this symbol in the last 4h
          const recent = await sql`
            SELECT id FROM telegram_alerts
            WHERE  symbol    = ${sym}
              AND  exchange  = ${item.exchange as string}
              AND  triggered_at > NOW() - INTERVAL '4 hours'
            LIMIT 1
          `
          if (recent.length > 0) {
            console.log(`[entries] ${sym} skipped — already alerted within 4h`)
            continue
          }

          await sql`
            INSERT INTO telegram_alerts
              (symbol, exchange, entry_price, stop_price, score, adjusted_score, signals, entry_signals, market_condition)
            VALUES (
              ${sym}, ${item.exchange as string},
              ${entryPrice}, ${stopPrice},
              ${item.score as number}, ${adjustedScore},
              ${JSON.stringify(item.signals)}::jsonb,
              ${JSON.stringify(entrySignals)}::jsonb,
              ${item.market_condition as string}
            )
          `

          const exchange      = item.exchange as string
          const exchangeLabel = EXCHANGE_LABEL[exchange] ?? 'OKX'
          const tradeLink     = exchangeTradeLink(exchange, sym)
          const allSignalKeys = [...(item.signals as string[]), ...entrySignals]
          const signalStr     = allSignalKeys.map(s => SIGNAL_DISPLAY[s] ?? s).join(', ')

          const tp1 = entryPrice * 0.985
          const tp2 = entryPrice * 0.975
          const tp3 = entryPrice * 0.96
          const rawScore = item.score as number
          const div = '━━━━━━━━━━━━━━━━━━'

          const text = '<b>' + [
            div,
            '🔴 SHORT SIGNAL',
            div,
            '',
            `💰 $${displaySymbol}`,
            `📊 Score: ${adjustedScore} (${rawScore})`,
            `🏦 Exchange: ${exchangeLabel}`,
            '📉 Market: BEARISH ✅',
            '',
            `💲 Entry: $${fmtPrice(entryPrice)}`,
            '',
            '🎯 Targets:',
            `   TP1: $${fmtPrice(tp1)} (-1.5%)`,
            `   TP2: $${fmtPrice(tp2)} (-2.5%)`,
            `   TP3: $${fmtPrice(tp3)} (-4.0%)`,
            '',
            `🛑 Stop: $${fmtPrice(stopPrice)} (last swing high)`,
            '',
            `📋 Signals: ${signalStr}`,
            '',
            `🔗 Trade now: ${tradeLink}`,
            '',
            '⚡ trading365.org/scanner',
            div,
          ].join('\n') + '</b>'

          // Single premium channel (TELEGRAM_CHAT_ID = @ShortsScanner) — one send only.
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
              (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition, direction)
            VALUES (
              ${item.symbol as string}, ${item.exchange as string},
              ${entryPrice},
              ${adjustedScore}, ${item.score as number},
              ${signalsLiteral}::text[],
              ${item.market_condition as string},
              'short'
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
