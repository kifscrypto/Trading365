import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  okx1hKlines, hyperliquid1hKlines, mexcKlines, weex1hKlines, bitunix1hKlines,
  calcRSI, setupSignalTables, EXCHANGE_LABEL, clampStop,
  type Kline, type SqlClient,
} from '@/app/api/scanner/_core'
import { exchangeReferralUrl, isExcludedSymbol } from '@/app/api/scanner/_config'
import { discordSignal } from '@/lib/discord'

// Long entry trigger — parallel to /api/scanner/entries, inverted for longs.
// Reads the long watchlist, fires only in a BULLISH-BTC ('uptrend') regime, and
// alerts on bullish 1H entry triggers. Fired alerts are recorded in a SEPARATE
// telegram_alerts_long table so the short monitor cron (short-only TP logic) is
// never fed long rows. Existing short scanner code is untouched.

const SIGNAL_DISPLAY: Record<string, string> = {
  // Pullback-within-uptrend scoring signals
  d_above_trend:       'D Uptrend',
  d_golden:            'D Golden X',
  d_higher_lows:       'D HL',
  pullback_zone:       'Pullback',
  near_200ema:         'At 200EMA',
  above_200ema:        '>200EMA',
  rsi_oversold:        'RSI<40',
  rsi_soft:            'RSI<50',
  macd_pullback:       'MACD Dip',
  low_vol_pullback:    'Low Vol',
  vol_drying_up:       'Vol Drying',
  funding_negative:    'Fund Neg',
  funding_low:         'Fund Low',
  confluence:          'Confluence',
  reduced_confidence:  '⚠ Young',
  // 1h entry triggers
  rsi_1h_turn_up:      'RSI 1H ↑',
  engulf_near_200:     'Bull Engulf',
  ema_bounce_hl:       'EMA Bounce',
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

// --- 1H bullish entry triggers (pullback-within-uptrend model) ---
// The dip-buy fires when the 4h setup is a healthy pullback and the 1h shows the
// dip is ENDING. Any ONE of three triggers qualifies (1-of-3 OR'd); the looser
// trigger logic is compensated by the higher entry threshold (adjusted ≥ 8).
// The 4h EMA levels referenced here are read from the watchlist row (stored at
// scoring time), so the entry route never re-fetches 4h klines.

// Trigger A — RSI turning up off an oversold 1h reading (the dip is reversing).
function checkRSIturnUp(klines: Kline[]): boolean {
  if (klines.length < 20) return false
  const closes  = klines.map(k => parseFloat(k[4]))
  const rsiNow  = calcRSI(closes)
  const rsiPrev = calcRSI(closes.slice(0, -3))
  return rsiPrev < 40 && rsiNow > rsiPrev
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

// Trigger B — bullish engulfing on 1h occurring near the 4h 200EMA (support).
function checkEngulfNear200(klines: Kline[], ema200_4h: number | null): boolean {
  if (!ema200_4h || ema200_4h <= 0) return false
  if (!checkBullishEngulfing(klines)) return false
  const price = parseFloat(klines[klines.length - 1][4])
  return Math.abs(price - ema200_4h) / ema200_4h <= 0.05   // within 5% of 200EMA
}

// Trigger C — bounce off a 4h EMA (50 or 200) with a higher-low forming on 1h.
function checkEmaBounceHL(klines: Kline[], ema50_4h: number | null, ema200_4h: number | null): boolean {
  if (klines.length < 16) return false
  const lows  = klines.map(k => parseFloat(k[3]))
  const price = parseFloat(klines[klines.length - 1][4])
  // Recent low dipped to/below a 4h EMA (within 1.5%) and price reclaimed above it.
  const bouncedOff = (ema: number | null) =>
    !!ema && ema > 0 && Math.min(...lows.slice(-5)) <= ema * 1.015 && price > ema
  const bounced = bouncedOff(ema50_4h) || bouncedOff(ema200_4h)
  // Higher-low forming: most recent swing low above the prior swing low.
  const recentSwing = Math.min(...lows.slice(-3))
  const priorSwing  = Math.min(...lows.slice(-8, -3))
  return bounced && recentSwing > priorSwing
}

function swingLow(klines: Kline[], lookback = 10): number {
  return Math.min(...klines.slice(-lookback).map(k => parseFloat(k[3])))
}

// --- Telegram (single premium channel, same as the short route now does) ---

async function sendTelegram(text: string, button?: { text: string; url: string }): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[long-entries/sendTelegram] missing token or chatId — token present:', !!token, 'chatId:', chatId)
    return
  }
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (button) body.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] }
  const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
        signals, market_condition, price,
        ema50_4h, ema200_4h, price_distance_pct
      FROM scanner_long_watchlist
      WHERE created_at > NOW() - INTERVAL '5 hours'
      ORDER BY symbol, exchange, created_at DESC
    `

    console.log(`[long-entries] watchlist: ${watchlist.length} symbols found`)

    if (watchlist.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, triggered: 0, note: 'watchlist empty' })
    }

    // Hard regime gate — longs ONLY fire when the BTC regime is 'uptrend' (bullish BTC).
    const marketCondition = (watchlist[0].market_condition as string) ?? 'neutral'
    if (marketCondition !== 'uptrend') {
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

        // Belt-and-suspenders: skip non-altcoins (stocks/forex/leveraged tokens),
        // in case a stale watchlist row pre-dates the scorer-level exclude.
        if (isExcludedSymbol(sym)) continue

        if (klineResults[j].status !== 'fulfilled') continue
        const klines = (klineResults[j] as PromiseFulfilledResult<Kline[]>).value
        if (klines.length < 20) continue

        // 4h EMA levels stored on the watchlist row (NUMERIC → string from neon).
        const ema50_4h  = item.ema50_4h  != null ? Number(item.ema50_4h)  : null
        const ema200_4h = item.ema200_4h != null ? Number(item.ema200_4h) : null

        const rsiTurn   = checkRSIturnUp(klines)
        const engulf200 = checkEngulfNear200(klines, ema200_4h)
        const emaBounce = checkEmaBounceHL(klines, ema50_4h, ema200_4h)
        const firedCount = [rsiTurn, engulf200, emaBounce].filter(Boolean).length
        console.log(`[long-entries] ${sym} 1H triggers — RSI turn-up:${rsiTurn} Engulf@200:${engulf200} EMA bounce+HL:${emaBounce} → firedCount:${firedCount}`)

        // 1-of-3 OR'd entry triggers (compensated by the ≥8 score threshold below).
        if (firedCount < 1) continue

        const entrySignals: string[] = []
        if (rsiTurn)   entrySignals.push('rsi_1h_turn_up')
        if (engulf200) entrySignals.push('engulf_near_200')
        if (emaBounce) entrySignals.push('ema_bounce_hl')

        const entryPrice    = parseFloat(klines[klines.length - 1][4])
        // Protective stop = last swing low, clamped to 3–6% below entry.
        const stopPrice     = clampStop(entryPrice, swingLow(klines), 'long')
        const adjustedScore = (item.adjusted_score ?? item.score ?? 0) as number
        const displaySymbol = sym.replace('USDT', '')

        if (adjustedScore >= 8) {
          // Dedup: one alert per symbol per 4h (stops two exchanges firing the
          // same coin at once) AND never re-fire while a prior alert on this
          // symbol is still OPEN (closed_at IS NULL). Without the open-position
          // guard a coin that keeps qualifying re-fires the same trade every 4h,
          // stacking duplicate longs at the same entry/stop that then all SL
          // together on one pullback. Only re-alert once the prior trade resolves.
          // The 7-day bound on the open clause stops ancient pre-monitor rows
          // (unstamped legacy pending) from permanently suppressing a symbol.
          const recent = await sql`
            SELECT id FROM telegram_alerts_long
            WHERE  symbol    = ${sym}
              AND  ((closed_at IS NULL AND triggered_at > NOW() - INTERVAL '7 days')
                    OR triggered_at > NOW() - INTERVAL '4 hours')
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
          const allSignalKeys = [...(item.signals as string[]), ...entrySignals]
          const signalStr     = allSignalKeys.map(s => SIGNAL_DISPLAY[s] ?? s).join(', ')

          const tp1 = entryPrice * 1.015
          const tp2 = entryPrice * 1.025
          const tp3 = entryPrice * 1.04
          const rawScore = item.score as number
          const div = '━━━━━━━━━━━━━━━━━━'

          const text = '<b>' + [
            div,
            '🟢 LONG SIGNAL',
            div,
            '',
            `💰 $${displaySymbol}`,
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
            `🛑 Stop: $${fmtPrice(stopPrice)} (-${(((entryPrice - stopPrice) / entryPrice) * 100).toFixed(1)}%)`,
            '',
            `📋 Signals: ${signalStr}`,
            '',
            '⚡ trading365.org/scanner/longs',
            div,
          ].join('\n') + '</b>'

          // Trade link is a tappable inline button carrying our referral link.
          await sendTelegram(text, { text: `Trade ${displaySymbol} on ${exchangeLabel}`, url: exchangeReferralUrl(exchange) })
          // Mirror to Discord (styled embed). Never throws — Telegram is unaffected.
          await discordSignal({
            direction: 'long', symbol: displaySymbol, exchangeLabel,
            score: adjustedScore, rawScore,
            entry: fmtPrice(entryPrice), stopPrice: fmtPrice(stopPrice),
            stopPct: `-${(((entryPrice - stopPrice) / entryPrice) * 100).toFixed(1)}%`,
            targets: [
              { label: 'TP1', price: fmtPrice(tp1), pct: '+1.5%' },
              { label: 'TP2', price: fmtPrice(tp2), pct: '+2.5%' },
              { label: 'TP3', price: fmtPrice(tp3), pct: '+4.0%' },
            ],
            signals: signalStr,
            tradeText: `Trade ${displaySymbol} on ${exchangeLabel}`,
            tradeUrl: exchangeReferralUrl(exchange),
          })
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
              (symbol, exchange, price_at_signal, score, raw_score, signals, market_condition, direction, stop_price)
            VALUES (
              ${sym}, ${item.exchange as string},
              ${entryPrice},
              ${adjustedScore}, ${item.score as number},
              ${signalsLiteral}::text[],
              ${item.market_condition as string},
              'long',
              ${stopPrice}
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
