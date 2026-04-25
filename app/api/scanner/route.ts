import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  runOKXScan, runHyperliquidScan,
  fetchBtcSentimentData, applyBtcSentiment,
  setupSignalTables, logSignals,
  type RawResult,
} from '@/app/api/scanner/_core'

export const maxDuration = 60
const ROUTE_VERSION = 'v6-multitf-rsi-macd'

interface ScanResult extends RawResult {
  adjusted_score: number
  fng: number
  btc_dominance: number
  btc_funding: number
  btc_dom_trend: string
  market_condition: 'favourable' | 'neutral' | 'hostile'
  sentiment_flags: string[]
}

function isAuthorized(request: Request): boolean {
  const url = new URL(request.url)
  if (url.searchParams.get('cron') === 'true') return true
  if (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) return true
  const cookies = request.headers.get('cookie') ?? ''
  return cookies.split(';').some(c => c.trim().startsWith('admin_auth='))
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const exchange     = (searchParams.get('exchange') ?? 'okx').toLowerCase()
  const isCron       = searchParams.get('cron') === 'true'
  const forceRefresh = isCron || searchParams.get('refresh') === '1'

  const sql = neon(process.env.DATABASE_URL!)

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS scanner_results (
        id          SERIAL PRIMARY KEY,
        symbol      TEXT NOT NULL,
        price       NUMERIC,
        oi_usd      NUMERIC,
        funding_pct NUMERIC,
        score       INTEGER,
        signals     JSONB        DEFAULT '[]',
        exchange    TEXT         DEFAULT 'okx',
        scanned_at  TIMESTAMPTZ  DEFAULT NOW()
      )
    `
    await setupSignalTables(sql)

    await Promise.all([
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS fng             INTEGER`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_dominance   NUMERIC`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_funding     NUMERIC`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS btc_dom_trend   TEXT`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS market_condition TEXT`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS adjusted_score  INTEGER`,
      sql`ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS sentiment_flags JSONB DEFAULT '[]'`,
    ])

    if (!forceRefresh) {
      const cached = await sql`
        SELECT symbol, price::float, oi_usd::float, funding_pct::float,
               score, signals, exchange, scanned_at,
               adjusted_score, fng, btc_dominance::float, btc_funding::float,
               btc_dom_trend, market_condition, sentiment_flags
        FROM   scanner_results
        WHERE  exchange       = ${exchange}
          AND  scanned_at     > NOW() - INTERVAL '5 minutes'
          AND  adjusted_score IS NOT NULL
        ORDER  BY adjusted_score DESC
        LIMIT  20
      `
      if (cached.length > 0) {
        const first = cached[0]
        return NextResponse.json({
          results: cached,
          sentiment: {
            fng:             first.fng,
            btcDominance:    first.btc_dominance,
            domTrend:        first.btc_dom_trend ?? 'flat',
            btcFunding:      first.btc_funding,
            marketCondition: first.market_condition ?? 'neutral',
            sentimentFlags:  (first.sentiment_flags as string[] | null) ?? [],
          },
          cached: true,
          exchange,
        })
      }
    }

    const [rawResults, sentiment] = await Promise.all([
      exchange === 'hyperliquid' ? runHyperliquidScan() : runOKXScan(),
      fetchBtcSentimentData(sql),
    ])

    const results: ScanResult[] = rawResults.map(r => {
      const { adjustedScore, marketCondition, sentimentFlags } = applyBtcSentiment(r.score, sentiment)
      return {
        ...r,
        adjusted_score:   adjustedScore,
        fng:              sentiment.fng,
        btc_dominance:    sentiment.btcDominance,
        btc_funding:      sentiment.btcFunding,
        btc_dom_trend:    sentiment.domTrend,
        market_condition: marketCondition,
        sentiment_flags:  sentimentFlags,
      }
    }).sort((a, b) => b.adjusted_score - a.adjusted_score)

    await logSignals(sql, results)

    await sql`DELETE FROM scanner_results WHERE exchange = ${exchange}`
    await Promise.all(
      results.map(r => sql`
        INSERT INTO scanner_results (
          symbol, price, oi_usd, funding_pct, score, signals, exchange, scanned_at,
          adjusted_score, fng, btc_dominance, btc_funding, btc_dom_trend, market_condition, sentiment_flags
        ) VALUES (
          ${r.symbol}, ${r.price}, ${r.oi_usd}, ${r.funding_pct},
          ${r.score}, ${JSON.stringify(r.signals)}::jsonb,
          ${r.exchange}, ${r.scanned_at}::timestamptz,
          ${r.adjusted_score}, ${r.fng}, ${r.btc_dominance}, ${r.btc_funding},
          ${r.btc_dom_trend}, ${r.market_condition}, ${JSON.stringify(r.sentiment_flags)}::jsonb
        )
      `)
    )

    return NextResponse.json({
      results,
      sentiment: {
        fng:             sentiment.fng,
        btcDominance:    sentiment.btcDominance,
        domTrend:        sentiment.domTrend,
        btcFunding:      sentiment.btcFunding,
        marketCondition: results[0]?.market_condition ?? 'neutral',
        sentimentFlags:  results[0]?.sentiment_flags ?? [],
      },
      cached: false,
      exchange,
      v: ROUTE_VERSION,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scanner]', msg)
    return NextResponse.json({ error: 'Scan failed', detail: msg }, { status: 500 })
  }
}
