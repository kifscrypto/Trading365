import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { setupSignalTables, HEADERS } from '@/app/api/scanner/_core'

async function fetchOKXPrices(): Promise<Map<string, number>> {
  const r = await fetch(
    'https://www.okx.com/api/v5/market/tickers?instType=SWAP',
    { cache: 'no-store', headers: HEADERS }
  )
  if (!r.ok) return new Map()
  const d = await r.json()
  return new Map(
    ((d.data ?? []) as Array<{ instId: string; last: string }>)
      .filter(t => t.instId.endsWith('-USDT-SWAP'))
      .map(t => [t.instId.replace('-USDT-SWAP', 'USDT'), parseFloat(t.last)])
  )
}

async function fetchHLPrices(): Promise<Map<string, number>> {
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    cache: 'no-store',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }),
  })
  if (!r.ok) return new Map()
  const mids = await r.json() as Record<string, string>
  return new Map(
    Object.entries(mids).map(([coin, price]) => [coin + 'USDT', parseFloat(price)])
  )
}

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
    await setupSignalTables(sql)

    // Find signals in last 7 days that are missing one or more time-window outcomes
    const signals = await sql`
      SELECT
        s.id,
        s.symbol,
        s.exchange,
        s.price_at_signal::float               AS price_at_signal,
        EXTRACT(EPOCH FROM (NOW() - s.scanned_at)) / 3600 AS hours_old,
        (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 24 LIMIT 1) IS NULL AS needs_24h,
        (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 48 LIMIT 1) IS NULL AS needs_48h,
        (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 72 LIMIT 1) IS NULL AS needs_72h
      FROM scanner_signals s
      WHERE s.scanned_at > NOW() - INTERVAL '7 days'
        AND (
          (EXTRACT(EPOCH FROM (NOW() - s.scanned_at)) / 3600 >= 24
            AND (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 24 LIMIT 1) IS NULL)
          OR
          (EXTRACT(EPOCH FROM (NOW() - s.scanned_at)) / 3600 >= 48
            AND (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 48 LIMIT 1) IS NULL)
          OR
          (EXTRACT(EPOCH FROM (NOW() - s.scanned_at)) / 3600 >= 72
            AND (SELECT id FROM scanner_outcomes WHERE signal_id = s.id AND hours_after = 72 LIMIT 1) IS NULL)
        )
      ORDER BY s.scanned_at ASC
    `

    if (signals.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, note: 'no pending outcomes' })
    }

    const hasOKX = signals.some(s => s.exchange === 'okx')
    const hasHL  = signals.some(s => s.exchange === 'hyperliquid')

    // Single batch price fetch per exchange
    const [okxPrices, hlPrices] = await Promise.all([
      hasOKX ? fetchOKXPrices() : Promise.resolve(new Map<string, number>()),
      hasHL  ? fetchHLPrices()  : Promise.resolve(new Map<string, number>()),
    ])

    let processed = 0
    const rows: Array<{ symbol: string; hours: number; pct: number }> = []

    for (const sig of signals) {
      const priceMap   = sig.exchange === 'hyperliquid' ? hlPrices : okxPrices
      const currentPrice = priceMap.get(sig.symbol as string)
      if (!currentPrice) continue

      const hours     = sig.hours_old as number
      const entryPrice = sig.price_at_signal as number
      const pctChange  = ((currentPrice - entryPrice) / entryPrice) * 100

      const toRecord: number[] = []
      if (hours >= 24 && sig.needs_24h) toRecord.push(24)
      if (hours >= 48 && sig.needs_48h) toRecord.push(48)
      if (hours >= 72 && sig.needs_72h) toRecord.push(72)

      for (const hours_after of toRecord) {
        await sql`
          INSERT INTO scanner_outcomes (signal_id, hours_after, price, pct_change)
          VALUES (${sig.id as number}, ${hours_after}, ${currentPrice}, ${pctChange})
        `
        rows.push({ symbol: sig.symbol as string, hours: hours_after, pct: Math.round(pctChange * 100) / 100 })
        processed++
      }
    }

    return NextResponse.json({ ok: true, processed, outcomes: rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[outcomes]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
