import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import type { SqlClient } from "@/app/api/scanner/_core"
import type {
  LiveData, LiveSignal, LiveRecord, LiveContext, LivePrice, Verdict,
} from "@/lib/live-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Price board (matches the scene). Alt-breadth uses a wider fixed top-alt list.
const PRICE_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]
const ALT_BREADTH = [
  "SOL", "BNB", "XRP", "DOGE", "AVAX", "ADA", "LINK", "TRX", "DOT", "LTC",
  "BCH", "NEAR", "APT", "ARB", "OP", "INJ", "SUI", "TIA", "SEI", "RUNE",
]

// market_condition (gate OUTPUT category) → broadcast verdict. This is the only
// gate-derived value allowed out; gate INPUTS are never read.
function toVerdict(mc: string | null | undefined): Verdict {
  if (mc === "favourable") return "short"
  if (mc === "hostile") return "long"
  return "neutral"
}

type Row = Record<string, unknown>
const num = (v: unknown): number => (v == null ? NaN : Number(v))

// ── Regime verdict (read-only) ──────────────────────────────────────────────
async function getRegime(sql: SqlClient) {
  let verdict: Verdict = "neutral"
  let lastSignalAt: string | null = null
  try {
    const rows = (await sql`
      SELECT market_condition, created_at FROM scanner_watchlist
      UNION ALL
      SELECT market_condition, created_at FROM scanner_long_watchlist
      ORDER BY created_at DESC
      LIMIT 1
    `) as Row[]
    verdict = toVerdict(rows[0]?.market_condition as string | undefined)
  } catch { /* default neutral */ }
  try {
    const r = (await sql`SELECT MAX(scanned_at) AS t FROM scanner_signals`) as Row[]
    lastSignalAt = r[0]?.t ? new Date(r[0].t as string).toISOString() : null
  } catch { /* null */ }
  return { verdict, lastSignalAt }
}

// ── Recent signals feed (both books), TP tiers derived from 24h outcome ─────
async function getSignals(sql: SqlClient): Promise<LiveSignal[]> {
  try {
    const rows = (await sql`
      SELECT s.symbol, s.direction, s.price_at_signal, s.score, s.scanned_at,
             o.pct_change
      FROM scanner_signals s
      LEFT JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.score >= 7
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `) as Row[]

    const now = Date.now()
    return rows.map((r) => {
      const direction = (r.direction as string) === "long" ? "long" : "short"
      const pct = r.pct_change == null ? null : num(r.pct_change)
      const hasOutcome = pct != null && Number.isFinite(pct)
      // short wins on a drop (≤ −1.5/−2.5/−4); long wins on a rise (≥ +1.5/+2.5/+4)
      const tier = (t1: number, t2: number, t3: number) =>
        direction === "short"
          ? { tp1: pct! <= -t1, tp2: pct! <= -t2, tp3: pct! <= -t3 }
          : { tp1: pct! >= t1, tp2: pct! >= t2, tp3: pct! >= t3 }
      const tps = hasOutcome ? tier(1.5, 2.5, 4) : { tp1: false, tp2: false, tp3: false }
      // signed favourable move: short captures the negative of pct, long the pct
      const closeResult = hasOutcome ? (direction === "short" ? -pct! : pct!) : null
      const scannedMs = new Date(r.scanned_at as string).getTime()
      return {
        pair: String(r.symbol).replace("USDT", ""),
        direction,
        entry: num(r.price_at_signal),
        tp1: tps.tp1, tp2: tps.tp2, tp3: tps.tp3,
        closeResult,
        score: num(r.score),
        time: new Date(scannedMs).toISOString(),
        live: !hasOutcome && now - scannedMs < 25 * 60 * 1000,
      }
    })
  } catch {
    return []
  }
}

// ── 30-day track record (mirrors each scanner page's win definition) ────────
async function getRecord(sql: SqlClient): Promise<LiveRecord> {
  const empty: LiveRecord = {
    combinedHitRate: null,
    long: { hitRate: null, count: 0 },
    short: { hitRate: null, count: 0 },
    capturedPct: 0,
  }
  try {
    const [shortRow] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE o.pct_change IS NOT NULL)::int AS cnt,
        COUNT(*) FILTER (WHERE o.pct_change <= -1.5)::int      AS hits,
        COALESCE(SUM(ABS(o.pct_change)) FILTER (WHERE o.pct_change <= -1.5),0)::float AS captured
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.market_condition = 'favourable' AND s.score >= 7
        AND s.scanned_at > NOW() - INTERVAL '30 days'
    `) as Row[]
    const [longRow] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE o.pct_change IS NOT NULL)::int AS cnt,
        COUNT(*) FILTER (WHERE o.pct_change >= 1.5)::int       AS hits,
        COALESCE(SUM(ABS(o.pct_change)) FILTER (WHERE o.pct_change >= 1.5),0)::float AS captured
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.direction = 'long' AND s.market_condition = 'hostile' AND s.score >= 7
        AND s.scanned_at > NOW() - INTERVAL '30 days'
    `) as Row[]

    const sCnt = num(shortRow?.cnt) || 0, sHits = num(shortRow?.hits) || 0
    const lCnt = num(longRow?.cnt) || 0, lHits = num(longRow?.hits) || 0
    const totalCnt = sCnt + lCnt, totalHits = sHits + lHits
    return {
      combinedHitRate: totalCnt > 0 ? (totalHits / totalCnt) * 100 : null,
      long: { hitRate: lCnt > 0 ? (lHits / lCnt) * 100 : null, count: lCnt },
      short: { hitRate: sCnt > 0 ? (sHits / sCnt) * 100 : null, count: sCnt },
      capturedPct: (num(shortRow?.captured) || 0) + (num(longRow?.captured) || 0),
    }
  } catch {
    return empty
  }
}

// ── Public market data (Binance public REST), independent of the gate ───────
type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; openPrice: string }

async function fetchTickers(): Promise<Map<string, Ticker>> {
  const symbols = Array.from(new Set([...PRICE_SYMBOLS, ...ALT_BREADTH])).map((s) => s + "USDT")
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`binance ${res.status}`)
  const arr = (await res.json()) as Ticker[]
  return new Map(arr.map((t) => [t.symbol, t]))
}

function buildPricesAndContext(tk: Map<string, Ticker>): { prices: LivePrice[]; context: LiveContext } {
  const prices: LivePrice[] = PRICE_SYMBOLS.map((s) => {
    const t = tk.get(s + "USDT")
    return { symbol: s, price: t ? parseFloat(t.lastPrice) : NaN, change24h: t ? parseFloat(t.priceChangePercent) : NaN }
  }).filter((p) => Number.isFinite(p.price))

  const btc = tk.get("BTCUSDT")
  const btcMomentum = btc ? parseFloat(btc.priceChangePercent) : null
  const volatility = btc
    ? ((parseFloat(btc.highPrice) - parseFloat(btc.lowPrice)) / parseFloat(btc.openPrice)) * 100
    : null
  const altList = ALT_BREADTH.map((s) => tk.get(s + "USDT")).filter(Boolean) as Ticker[]
  const altBreadth = altList.length
    ? (altList.filter((t) => parseFloat(t.priceChangePercent) > 0).length / altList.length) * 100
    : null

  return { prices, context: { btcMomentum, volatility, altBreadth } }
}

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode")
  const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } }

  // Lightweight prices-only mode for the fast (~3s) price poll.
  if (mode === "prices") {
    try {
      const { prices, context } = buildPricesAndContext(await fetchTickers())
      return NextResponse.json({ prices, context }, noStore)
    } catch {
      return NextResponse.json({ prices: [], context: { btcMomentum: null, volatility: null, altBreadth: null } }, noStore)
    }
  }

  const sql = neon(process.env.DATABASE_URL!) as SqlClient
  const [regime, signals, record, tickers] = await Promise.all([
    getRegime(sql),
    getSignals(sql),
    getRecord(sql),
    fetchTickers().catch(() => new Map<string, Ticker>()),
  ])
  const { prices, context } = buildPricesAndContext(tickers)

  const data: LiveData = { regime, signals, record, context, prices, ts: Date.now() }
  return NextResponse.json(data, noStore)
}
