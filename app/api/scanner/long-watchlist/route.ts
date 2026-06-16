import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  runOKXScan, runHyperliquidScan, runMEXCScan, runWEEXScan, runBitunixScan,
  fetchBtcSentimentData, applyBtcSentiment,
  logSignals,
} from '@/app/api/scanner/_core'

export const maxDuration = 60

// Long-side watchlist builder. Mirrors /api/scanner/watchlist exactly — same
// exchanges, same coin universe, same BTC sentiment system — but runs the
// inverted (bullish) scoring model and stores everything as direction='long'.
// Writes to its OWN scanner_long_watchlist table so the short entries pipeline
// is never affected.
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
      CREATE TABLE IF NOT EXISTS scanner_long_watchlist (
        id               SERIAL PRIMARY KEY,
        symbol           TEXT        NOT NULL,
        exchange         TEXT        NOT NULL,
        score            INTEGER,
        adjusted_score   INTEGER,
        signals          JSONB       DEFAULT '[]',
        sentiment_flags  JSONB       DEFAULT '[]',
        market_condition TEXT,
        price            NUMERIC,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // All exchanges (long-scored) + BTC sentiment in parallel. allSettled-style
    // catch per scan so one exchange outage can't abort the whole build.
    const [okxResults, hlResults, mexcResults, weexResults, bitunixResults, sentiment] = await Promise.all([
      runOKXScan('long').catch(() => []),
      runHyperliquidScan('long').catch(() => []),
      runMEXCScan('long').catch(() => []),
      runWEEXScan('long').catch(() => []),
      runBitunixScan('long').catch(() => []),
      fetchBtcSentimentData(sql),
    ])

    const allResults = [...okxResults, ...hlResults, ...mexcResults, ...weexResults, ...bitunixResults].map(r => {
      const { adjustedScore, marketCondition, sentimentFlags } = applyBtcSentiment(r.score, sentiment, 'long')
      return { ...r, adjusted_score: adjustedScore, market_condition: marketCondition, sentiment_flags: sentimentFlags }
    })

    await logSignals(sql, allResults, 'long')

    // Insert first, then clean up old rows — no gap window for a long entries cron
    await Promise.all(
      allResults.map(r => sql`
        INSERT INTO scanner_long_watchlist
          (symbol, exchange, score, adjusted_score, signals, sentiment_flags, market_condition, price)
        VALUES (
          ${r.symbol}, ${r.exchange}, ${r.score}, ${r.adjusted_score},
          ${JSON.stringify(r.signals)}::jsonb, ${JSON.stringify(r.sentiment_flags)}::jsonb,
          ${r.market_condition}, ${r.price}
        )
      `)
    )
    await sql`DELETE FROM scanner_long_watchlist WHERE created_at < NOW() - INTERVAL '8 hours'`

    return NextResponse.json({
      ok:        true,
      direction: 'long',
      count:     allResults.length,
      okx:       okxResults.length,
      hl:        hlResults.length,
      mexc:      mexcResults.length,
      weex:      weexResults.length,
      bitunix:   bitunixResults.length,
      sentiment: { fng: sentiment.fng, marketCondition: allResults[0]?.market_condition ?? 'neutral' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[long-watchlist]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
