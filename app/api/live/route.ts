import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { HEADERS, type SqlClient } from "@/app/api/scanner/_core"
import type {
  LiveData, LiveSignal, LiveClosed, LiveRecord, LiveContext, LivePrice, Verdict,
} from "@/lib/live-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Price board (matches the scene). Alt-breadth uses a wider fixed top-alt list.
const PRICE_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]
const ALT_BREADTH = [
  "SOL", "BNB", "XRP", "DOGE", "AVAX", "ADA", "LINK", "TRX", "DOT", "LTC",
  "BCH", "NEAR", "APT", "ARB", "OP", "INJ", "SUI", "TIA", "SEI", "RUNE",
]

// Tokenized stock / commodity / FX perps the multi-exchange scanner can pick up
// (e.g. INTCUSDT, XAUUSDT, BZUSDT). Real, but off-brand for an ALTCOIN broadcast
// — excluded from the public feed AND the track record so both stay consistent.
const NON_CRYPTO_BASES = [
  "INTC", "MU", "NVDA", "AAPL", "TSLA", "AMZN", "GOOGL", "GOOG", "META", "MSFT",
  "AMD", "NFLX", "PLTR", "HOOD", "COIN", "MSTR", "BABA", "SPY", "QQQ", "SPX", "NDX",
  "XAU", "XAG", "XPT", "XPD", "BZ", "WTI", "CL", "GOLD", "OIL", "GAS", "NG",
]
const EXCLUDE = NON_CRYPTO_BASES.map((b) => b + "USDT")

// market_condition (gate OUTPUT category) → broadcast verdict. The only
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
    const r = (await sql`
      SELECT MAX(scanned_at) AS t FROM scanner_signals
      WHERE score >= 7 AND symbol <> ALL(${EXCLUDE})
    `) as Row[]
    lastSignalAt = r[0]?.t ? new Date(r[0].t as string).toISOString() : null
  } catch { /* null */ }
  return { verdict, lastSignalAt }
}

function mapSignal(r: Row): LiveSignal {
  const direction = (r.direction as string) === "long" ? "long" : "short"
  const pct = r.pct_change == null ? null : num(r.pct_change)
  const hasOutcome = pct != null && Number.isFinite(pct)
  // short wins on a drop (≤ −1.5/−2.5/−4); long wins on a rise (≥ +1.5/+2.5/+4)
  const tps = hasOutcome
    ? (direction === "short"
        ? { tp1: pct! <= -1.5, tp2: pct! <= -2.5, tp3: pct! <= -4 }
        : { tp1: pct! >= 1.5, tp2: pct! >= 2.5, tp3: pct! >= 4 })
    : { tp1: false, tp2: false, tp3: false }
  // signed favourable move: short captures the negative of pct, long the pct
  const closeResult = hasOutcome ? (direction === "short" ? -pct! : pct!) : null
  const scannedMs = new Date(r.scanned_at as string).getTime()
  return {
    id: num(r.id),
    pair: String(r.symbol).replace("USDT", ""),
    direction,
    entry: num(r.price_at_signal),
    ...tps,
    closeResult,
    score: num(r.score),
    time: new Date(scannedMs).toISOString(),
    live: !hasOutcome && Date.now() - scannedMs < 30 * 60 * 1000,
  }
}

// ── Recent panel: currently-OPEN fires (no 24h outcome yet), newest first ────
async function getSignals(sql: SqlClient): Promise<{ signals: LiveSignal[]; latestSignalId: number | null }> {
  try {
    const rows = (await sql`
      SELECT s.id, s.symbol, s.direction, s.price_at_signal, s.score, s.scanned_at, NULL AS pct_change
      FROM scanner_signals s
      LEFT JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.score >= 7 AND s.symbol <> ALL(${EXCLUDE}) AND o.id IS NULL
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `) as Row[]
    const [maxRow] = (await sql`
      SELECT MAX(id)::int AS m FROM scanner_signals WHERE score >= 7 AND symbol <> ALL(${EXCLUDE})
    `) as Row[]
    const signals = rows.map(mapSignal)
    return { signals, latestSignalId: maxRow?.m != null ? num(maxRow.m) : (signals[0]?.id ?? null) }
  } catch {
    return { signals: [], latestSignalId: null }
  }
}

// ── Closed panel: most recent signals that HAVE a matured 24h outcome ────────
function closedResult(direction: "long" | "short", pct: number): { result: string; win: boolean } {
  const captured = direction === "short" ? -pct : pct // favourable move
  if (captured >= 1.5) {
    const tier = captured >= 4 ? 3 : captured >= 2.5 ? 2 : 1
    return { result: `TP${tier} +${captured.toFixed(1)}%`, win: true }
  }
  return { result: `${captured >= 0 ? "+" : "−"}${Math.abs(captured).toFixed(1)}%`, win: false }
}

async function getClosed(sql: SqlClient): Promise<LiveClosed[]> {
  try {
    const rows = (await sql`
      SELECT s.id, s.symbol, s.direction, s.scanned_at, o.pct_change
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.score >= 7 AND s.symbol <> ALL(${EXCLUDE})
      ORDER BY s.scanned_at DESC
      LIMIT 10
    `) as Row[]
    return rows.map((r) => {
      const direction = (r.direction as string) === "long" ? "long" : "short"
      const { result, win } = closedResult(direction, num(r.pct_change))
      return {
        id: num(r.id),
        pair: String(r.symbol).replace("USDT", ""),
        direction,
        result,
        win,
        time: new Date(r.scanned_at as string).toISOString(),
      }
    })
  } catch {
    return []
  }
}

// ── 30-day track record: per-book hit rate + counts + AVERAGE move/signal ────
async function getRecord(sql: SqlClient): Promise<LiveRecord> {
  const empty: LiveRecord = { combinedHitRate: null, long: { hitRate: null, count: 0 }, short: { hitRate: null, count: 0 }, avgMove: null }
  try {
    const [shortRow] = (await sql`
      SELECT COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE o.pct_change <= -1.5)::int AS hits,
             COALESCE(SUM(-o.pct_change), 0)::float AS summove
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.market_condition = 'favourable' AND s.score >= 7 AND s.symbol <> ALL(${EXCLUDE})
        AND s.scanned_at > NOW() - INTERVAL '30 days'
    `) as Row[]
    const [longRow] = (await sql`
      SELECT COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE o.pct_change >= 1.5)::int AS hits,
             COALESCE(SUM(o.pct_change), 0)::float AS summove
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.direction = 'long' AND s.market_condition = 'hostile' AND s.score >= 7 AND s.symbol <> ALL(${EXCLUDE})
        AND s.scanned_at > NOW() - INTERVAL '30 days'
    `) as Row[]

    const sCnt = num(shortRow?.cnt) || 0, sHits = num(shortRow?.hits) || 0, sSum = num(shortRow?.summove) || 0
    const lCnt = num(longRow?.cnt) || 0, lHits = num(longRow?.hits) || 0, lSum = num(longRow?.summove) || 0
    const totalCnt = sCnt + lCnt, totalHits = sHits + lHits
    return {
      combinedHitRate: totalCnt > 0 ? (totalHits / totalCnt) * 100 : null,
      long: { hitRate: lCnt > 0 ? (lHits / lCnt) * 100 : null, count: lCnt },
      short: { hitRate: sCnt > 0 ? (sHits / sCnt) * 100 : null, count: sCnt },
      avgMove: totalCnt > 0 ? (sSum + lSum) / totalCnt : null,
    }
  } catch {
    return empty
  }
}

// ── Public market data via OKX SWAP tickers (the source the scanner's own crons
//    use successfully from Vercel — Binance 403/451s cloud IPs). Cached ~12s so
//    the source is hit once per interval regardless of client poll rate. ──────
type Ticker = { instId: string; last: string; open24h: string; high24h: string; low24h: string }
const inst = (s: string) => `${s}-USDT-SWAP`

async function fetchTickers(): Promise<Map<string, Ticker>> {
  const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SWAP", {
    headers: HEADERS,
    next: { revalidate: 12 },
  })
  if (!res.ok) throw new Error(`okx ${res.status}`)
  const json = (await res.json()) as { data?: Ticker[] }
  return new Map((json.data ?? []).map((t) => [t.instId, t]))
}

function buildPricesAndContext(tk: Map<string, Ticker>): { prices: LivePrice[]; context: LiveContext } {
  const chg = (t: Ticker) => { const o = parseFloat(t.open24h); return o ? ((parseFloat(t.last) - o) / o) * 100 : 0 }

  const prices: LivePrice[] = PRICE_SYMBOLS.map((s) => {
    const t = tk.get(inst(s))
    return t ? { symbol: s, price: parseFloat(t.last), change24h: chg(t) } : null
  }).filter((p): p is LivePrice => p != null && Number.isFinite(p.price))

  const btc = tk.get(inst("BTC"))
  const btcMomentum = btc ? chg(btc) : null
  const volatility = btc
    ? ((parseFloat(btc.high24h) - parseFloat(btc.low24h)) / parseFloat(btc.open24h)) * 100
    : null
  const alt = ALT_BREADTH.map((s) => tk.get(inst(s))).filter((t): t is Ticker => t != null)
  const altBreadth = alt.length ? (alt.filter((t) => chg(t) > 0).length / alt.length) * 100 : null

  return { prices, context: { btcMomentum, volatility, altBreadth } }
}

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode")
  const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } }

  // Lightweight prices-only mode for the fast (~3s) poll.
  if (mode === "prices") {
    try {
      const { prices, context } = buildPricesAndContext(await fetchTickers())
      return NextResponse.json({ prices, context, feedOk: prices.length > 0 }, noStore)
    } catch (e) {
      console.error("[live] price source failed:", e instanceof Error ? e.message : e)
      return NextResponse.json({ prices: [], context: { btcMomentum: null, volatility: null, altBreadth: null }, feedOk: false }, noStore)
    }
  }

  const sql = neon(process.env.DATABASE_URL!) as SqlClient
  let prices: LivePrice[] = []
  let context: LiveContext = { btcMomentum: null, volatility: null, altBreadth: null }
  let feedOk = false
  const [regime, sig, closed, record, tickers] = await Promise.all([
    getRegime(sql),
    getSignals(sql),
    getClosed(sql),
    getRecord(sql),
    fetchTickers().catch((e) => { console.error("[live] price source failed:", e instanceof Error ? e.message : e); return null }),
  ])
  if (tickers) { ({ prices, context } = buildPricesAndContext(tickers)); feedOk = prices.length > 0 }

  const data: LiveData = {
    regime,
    signals: sig.signals,
    closed,
    latestSignalId: sig.latestSignalId,
    record,
    context,
    prices,
    feedOk,
    ts: Date.now(),
  }
  return NextResponse.json(data, noStore)
}
