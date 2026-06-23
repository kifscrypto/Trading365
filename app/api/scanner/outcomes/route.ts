import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import {
  setupSignalTables, HEADERS,
  okx1hKlines, hyperliquid1hKlines, mexcKlines, type Kline,
} from '@/app/api/scanner/_core'
import { persistPnl } from '@/lib/scanner-pnl'

// Fetch 1h klines for a signal's symbol on its exchange, to detect whether the
// protective stop was touched at any point during the outcome window. Only the
// three exchanges the outcome tracker prices (OKX / Hyperliquid / MEXC) are
// supported; others return [] and fall back to the uncapped spot outcome.
async function fetchWindowKlines(exchange: string, symbol: string): Promise<Kline[]> {
  const base = symbol.replace(/USDT$/i, '')
  try {
    if (exchange === 'okx')         return await okx1hKlines(`${base}-USDT-SWAP`)
    if (exchange === 'hyperliquid') return await hyperliquid1hKlines(base)
    if (exchange === 'mexc')        return await mexcKlines(`${base}_USDT`, 'Min60', 80)
  } catch { /* fall through */ }
  return []
}

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

async function fetchMEXCPrices(): Promise<Map<string, number>> {
  const r = await fetch('https://api.mexc.com/api/v1/contract/ticker', {
    cache: 'no-store', headers: HEADERS,
  })
  if (!r.ok) return new Map()
  const d = await r.json()
  if (!d.success) return new Map()
  return new Map(
    ((d.data ?? []) as Array<{ symbol: string; lastPrice: string | number }>)
      .filter(t => t.symbol.endsWith('_USDT'))
      .map(t => [t.symbol.replace('_', ''), parseFloat(String(t.lastPrice))])
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

    // Tiered take-profit tracking columns (idempotent — safe to run every cycle)
    await sql`ALTER TABLE scanner_outcomes ADD COLUMN IF NOT EXISTS tp1_hit BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE scanner_outcomes ADD COLUMN IF NOT EXISTS tp2_hit BOOLEAN DEFAULT FALSE`
    await sql`ALTER TABLE scanner_outcomes ADD COLUMN IF NOT EXISTS tp3_hit BOOLEAN DEFAULT FALSE`

    // Exactly one outcome row per (signal, window). Overlapping cron runs used to
    // race past the needs_* check and insert duplicate 24h rows (double-counting
    // signals in the stats/P&L). This unique index + ON CONFLICT below makes the
    // insert idempotent so it can never happen again.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS scanner_outcomes_sig_hours_uniq ON scanner_outcomes (signal_id, hours_after)`

    // Find signals in last 7 days that are missing one or more time-window outcomes
    const signals = await sql`
      SELECT
        s.id,
        s.symbol,
        s.exchange,
        s.direction,
        s.price_at_signal::float               AS price_at_signal,
        s.stop_price::float                    AS stop_price,
        EXTRACT(EPOCH FROM s.scanned_at) * 1000 AS scanned_at_ms,
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

    const hasOKX  = signals.some(s => s.exchange === 'okx')
    const hasHL   = signals.some(s => s.exchange === 'hyperliquid')
    const hasMEXC = signals.some(s => s.exchange === 'mexc')

    // Single batch price fetch per exchange
    const [okxPrices, hlPrices, mexcPrices] = await Promise.all([
      hasOKX  ? fetchOKXPrices()  : Promise.resolve(new Map<string, number>()),
      hasHL   ? fetchHLPrices()   : Promise.resolve(new Map<string, number>()),
      hasMEXC ? fetchMEXCPrices() : Promise.resolve(new Map<string, number>()),
    ])

    let processed = 0
    const rows: Array<{ symbol: string; hours: number; pct: number }> = []

    for (const sig of signals) {
      const priceMap = sig.exchange === 'hyperliquid' ? hlPrices
                     : sig.exchange === 'mexc'        ? mexcPrices
                     : okxPrices
      const currentPrice = priceMap.get(sig.symbol as string)
      if (!currentPrice) continue

      const hours      = sig.hours_old as number
      const entryPrice = sig.price_at_signal as number
      const spotPct    = ((currentPrice - entryPrice) / entryPrice) * 100
      const isLong     = (sig.direction as string) === 'long'

      const toRecord: number[] = []
      if (hours >= 24 && sig.needs_24h) toRecord.push(24)
      if (hours >= 48 && sig.needs_48h) toRecord.push(48)
      if (hours >= 72 && sig.needs_72h) toRecord.push(72)
      if (toRecord.length === 0) continue

      // Stop-aware capping: when the signal carries a protective stop, fetch the
      // window's 1h klines once and, per window, check whether price ever pierced
      // the stop. If it did, the trade was stopped out — record the loss at the
      // stop level (never the raw spot move, which can over/understate it).
      const stopPrice = sig.stop_price as number | null
      const scannedMs = Number(sig.scanned_at_ms)
      const stopPct   = stopPrice != null ? ((stopPrice - entryPrice) / entryPrice) * 100 : null
      const klines    = stopPrice != null
        ? await fetchWindowKlines(sig.exchange as string, sig.symbol as string)
        : []

      for (const hours_after of toRecord) {
        // Stop breach anywhere in [scanned_at, scanned_at + hours_after]:
        // short stops when a high pierces above; long stops when a low pierces below.
        let stoppedOut = false
        if (stopPrice != null && klines.length) {
          const windowEnd = scannedMs + hours_after * 3_600_000
          const inWindow = klines.filter(k => { const t = Number(k[0]); return t >= scannedMs && t <= windowEnd })
          stoppedOut = inWindow.length > 0 && (isLong
            ? inWindow.some(k => parseFloat(k[3]) <= stopPrice)
            : inWindow.some(k => parseFloat(k[2]) >= stopPrice))
        }

        const pctChange   = stoppedOut && stopPct != null ? stopPct : spotPct
        const recordPrice = stoppedOut && stopPrice != null ? stopPrice : currentPrice

        // A stopped-out trade is never a win; otherwise direction-aware TP flags
        // (shorts win when price falls, longs when price rises) at the 24h check.
        const tp1Hit = !stoppedOut && hours_after === 24 && (isLong ? pctChange >=  1.5 : pctChange <= -1.5)
        const tp2Hit = !stoppedOut && hours_after === 24 && (isLong ? pctChange >=  2.5 : pctChange <= -2.5)
        const tp3Hit = !stoppedOut && hours_after === 24 && (isLong ? pctChange >=  4.0 : pctChange <= -4.0)
        await sql`
          INSERT INTO scanner_outcomes (signal_id, hours_after, price, pct_change, tp1_hit, tp2_hit, tp3_hit, stopped_out)
          VALUES (${sig.id as number}, ${hours_after}, ${recordPrice}, ${pctChange}, ${tp1Hit}, ${tp2Hit}, ${tp3Hit}, ${stoppedOut})
          ON CONFLICT (signal_id, hours_after) DO NOTHING
        `
        rows.push({ symbol: sig.symbol as string, hours: hours_after, pct: Math.round(pctChange * 100) / 100 })
        processed++
      }
    }

    // New 24h outcomes were recorded → rebuild the simulated P&L ledger so the
    // scanner pages and the live broadcast stay in sync. Best-effort: a failure
    // here must never fail outcome recording (persistPnl swallows its own errors).
    if (processed > 0) await persistPnl(sql)

    return NextResponse.json({ ok: true, processed, outcomes: rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[outcomes]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
