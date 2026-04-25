import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  runOKXScan, runHyperliquidScan,
  fetchBtcSentimentData, applyBtcSentiment,
} from '@/app/api/scanner/_core'

export const maxDuration = 60

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!)

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS scanner_watchlist (
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

    // Both exchanges + BTC sentiment in parallel
    const [okxResults, hlResults, sentiment] = await Promise.all([
      runOKXScan(),
      runHyperliquidScan(),
      fetchBtcSentimentData(sql),
    ])

    const allResults = [...okxResults, ...hlResults].map(r => {
      const { adjustedScore, marketCondition, sentimentFlags } = applyBtcSentiment(r.score, sentiment)
      return { ...r, adjusted_score: adjustedScore, market_condition: marketCondition, sentiment_flags: sentimentFlags }
    })

    // Insert first, then clean up old rows — no gap window for entries cron
    await Promise.all(
      allResults.map(r => sql`
        INSERT INTO scanner_watchlist
          (symbol, exchange, score, adjusted_score, signals, sentiment_flags, market_condition, price)
        VALUES (
          ${r.symbol}, ${r.exchange}, ${r.score}, ${r.adjusted_score},
          ${JSON.stringify(r.signals)}::jsonb, ${JSON.stringify(r.sentiment_flags)}::jsonb,
          ${r.market_condition}, ${r.price}
        )
      `)
    )
    await sql`DELETE FROM scanner_watchlist WHERE created_at < NOW() - INTERVAL '8 hours'`

    return NextResponse.json({
      ok:        true,
      count:     allResults.length,
      okx:       okxResults.length,
      hl:        hlResults.length,
      sentiment: { fng: sentiment.fng, marketCondition: allResults[0]?.market_condition ?? 'neutral' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[watchlist]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
