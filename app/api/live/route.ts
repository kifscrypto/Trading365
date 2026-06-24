import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { HEADERS, type SqlClient } from "@/app/api/scanner/_core"
import { computePnl, type PnlBook } from "@/lib/scanner-pnl"
import type {
  LiveData, LiveSignal, LiveClosed, LiveRecord, LiveContext, LivePrice, LivePnl, Verdict, Book,
} from "@/lib/live-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Price board (matches the scene). Alt-breadth uses a wider fixed top-alt list.
const PRICE_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]
const ALT_BREADTH = [
  "SOL", "BNB", "XRP", "DOGE", "AVAX", "ADA", "LINK", "TRX", "DOT", "LTC",
  "BCH", "NEAR", "APT", "ARB", "OP", "INJ", "SUI", "TIA", "SEI", "RUNE",
]

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
async function getRegime(sql: SqlClient, book: Book) {
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
    const real = toVerdict(rows[0]?.market_condition as string | undefined)
    // The regime FOLLOWS the selected book: a single book reads "engaged" only
    // when the market favours it, otherwise it stands down (neutral). Combined
    // shows the true market verdict.
    verdict =
      book === "combined" ? real :
      book === "short"    ? (real === "short" ? "short" : "neutral") :
                            (real === "long"  ? "long"  : "neutral")
  } catch { /* default neutral */ }
  try {
    // Last fired ALERT (Telegram send) for the book — not the last scored candidate.
    const r = (await sql`
      SELECT MAX(t) AS t FROM (
        SELECT MAX(triggered_at) AS t FROM telegram_alerts
        WHERE (${book} = 'combined' OR ${book} = 'short')
        UNION ALL
        SELECT MAX(triggered_at) AS t FROM telegram_alerts_long
        WHERE (${book} = 'combined' OR ${book} = 'long')
      ) x
    `) as Row[]
    lastSignalAt = r[0]?.t ? new Date(r[0].t as string).toISOString() : null
  } catch { /* null */ }
  return { verdict, lastSignalAt }
}

// ── Recent panel: actual fired Telegram alerts still inside their 24h window ──
// Sourced from telegram_alerts (short) ∪ telegram_alerts_long (long) — the exact
// rows that triggered a Telegram send — NOT scanner_signals (the scored-candidate
// pool). No score/regime/exclude/date re-filtering: the alert already cleared
// every gate at fire time, so re-filtering here is precisely what dropped them.
// Row id = triggered_at epoch-ms — monotonic across BOTH tables, so the client's
// "new signal" fire-trigger detection keeps working.
async function getSignals(sql: SqlClient, book: Book): Promise<{ signals: LiveSignal[]; latestSignalId: number | null }> {
  try {
    const rows = (await sql`
      SELECT id, symbol, direction, entry_price, score, triggered_at FROM (
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol,
               'short'::text AS direction, entry_price, adjusted_score AS score, triggered_at
        FROM telegram_alerts
        WHERE triggered_at > NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'short')
        UNION ALL
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol,
               'long'::text AS direction, entry_price, adjusted_score AS score, triggered_at
        FROM telegram_alerts_long
        WHERE triggered_at > NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'long')
      ) a
      ORDER BY triggered_at DESC
      LIMIT 10
    `) as Row[]

    const [maxRow] = (await sql`
      SELECT MAX(id) AS m FROM (
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id FROM telegram_alerts
        WHERE (${book} = 'combined' OR ${book} = 'short')
        UNION ALL
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id FROM telegram_alerts_long
        WHERE (${book} = 'combined' OR ${book} = 'long')
      ) a
    `) as Row[]

    // Open fires: TP tiers pending until the trade matures (shown in Closed then).
    const toSignal = (r: Row): LiveSignal => {
      const ms = num(r.id)
      return {
        id: ms,
        pair: String(r.symbol).replace("USDT", ""),
        direction: (r.direction as string) === "long" ? "long" : "short",
        entry: num(r.entry_price),
        tp1: false, tp2: false, tp3: false,
        closeResult: null,
        score: num(r.score),
        time: new Date(ms).toISOString(),
        live: Date.now() - ms < 30 * 60 * 1000,
      }
    }

    const signals: LiveSignal[] = rows.map(toSignal)
    if (signals.length > 0) {
      return { signals, latestSignalId: maxRow?.m != null ? num(maxRow.m) : signals[0].id }
    }

    // Fallback — no fired alert for this book in 24h (e.g. regime suppressing the
    // side). Replay from the scored candidate pool so the Fire button always has
    // something to show. id = scanned_at epoch-ms (same monotonic scheme as alerts).
    const fb = (await sql`
      SELECT (EXTRACT(EPOCH FROM scanned_at) * 1000)::bigint AS id, symbol, direction,
             price_at_signal AS entry_price, score, scanned_at
      FROM scanner_signals
      WHERE scanned_at > NOW() - INTERVAL '24 hours'
        AND (${book} = 'combined' OR direction = ${book})
      ORDER BY scanned_at DESC
      LIMIT 10
    `) as Row[]
    const fbSignals = fb.map(toSignal)
    return { signals: fbSignals, latestSignalId: fbSignals[0]?.id ?? null }
  } catch {
    return { signals: [], latestSignalId: null }
  }
}

// Legacy display fallback. The outcome tracker now caps losses at the real stop
// and sets stopped_out, but signals recorded before stop tracking have neither —
// for those, cap any loss worse than this at the stop level and tag it 'SL'.
const STOP_LOSS_PCT = 3

// ── Closed panel: most recent signals that HAVE a matured 24h outcome ────────
function closedResult(direction: "long" | "short", pct: number, stoppedOut: boolean): { result: string; win: boolean; stopped: boolean } {
  const captured = direction === "short" ? -pct : pct // favourable move
  if (!stoppedOut && captured >= 1.5) {
    const tier = captured >= 4 ? 3 : captured >= 2.5 ? 2 : 1
    return { result: `TP${tier} +${captured.toFixed(1)}%`, win: true, stopped: false }
  }
  // Stopped out (authoritative from the tracker), or a legacy loss worse than the
  // stop → show the stop level with an SL tag, never the raw move.
  if (stoppedOut || captured <= -STOP_LOSS_PCT) {
    const mag = stoppedOut ? Math.abs(captured) : STOP_LOSS_PCT
    return { result: `SL −${mag.toFixed(1)}%`, win: false, stopped: true }
  }
  return { result: `${captured >= 0 ? "+" : "−"}${Math.abs(captured).toFixed(1)}%`, win: false, stopped: false }
}

// Fired alerts that have matured (≥24h old). The alert tables don't track
// outcomes, so each alert is matched (Option A) to its scanner_signals candidate
// — same symbol+exchange+direction, scored at/just before the fire — and that
// candidate's 24h outcome. Only alerts with a matched outcome appear here.
async function getClosed(sql: SqlClient, book: Book): Promise<LiveClosed[]> {
  try {
    const rows = (await sql`
      SELECT a.id, a.symbol, a.direction, c.pct_change, c.stopped_out
      FROM (
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol, exchange,
               'short'::text AS direction, triggered_at
        FROM telegram_alerts
        WHERE triggered_at <= NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'short')
        UNION ALL
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol, exchange,
               'long'::text AS direction, triggered_at
        FROM telegram_alerts_long
        WHERE triggered_at <= NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'long')
      ) a
      JOIN LATERAL (
        SELECT o.pct_change, o.stopped_out
        FROM scanner_signals s
        JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
        WHERE s.symbol = a.symbol AND s.exchange = a.exchange AND s.direction = a.direction
          AND s.scanned_at <= a.triggered_at + INTERVAL '1 hour'
          AND s.scanned_at >  a.triggered_at - INTERVAL '6 hours'
        ORDER BY s.scanned_at DESC
        LIMIT 1
      ) c ON TRUE
      ORDER BY a.id DESC
      LIMIT 10
    `) as Row[]
    return rows.map((r) => {
      const direction = (r.direction as string) === "long" ? "long" : "short"
      const { result, win, stopped } = closedResult(direction, num(r.pct_change), Boolean(r.stopped_out))
      return {
        id: num(r.id),
        pair: String(r.symbol).replace("USDT", ""),
        direction,
        result,
        win,
        stopped,
        time: new Date(num(r.id)).toISOString(),
      }
    })
  } catch {
    return []
  }
}

// ── 30-day track record: per-book hit rate + counts + AVERAGE move/signal ────
async function getRecord(sql: SqlClient, book: Book): Promise<LiveRecord> {
  const empty: LiveRecord = { combinedHitRate: null, long: { hitRate: null, count: 0 }, short: { hitRate: null, count: 0 }, avgMove: null }
  try {
    // Filters are CANONICAL — identical to the scanner landing pages
    // (app/scanner/page.tsx, app/scanner/longs/page.tsx) and the performance
    // dashboard (app/api/scanner/performance/route.ts), so the broadcast hit rate
    // can never diverge from the advertised numbers. Short: direction='short' AND
    // favourable AND score>=7, TP1 = 24h pct_change <= -1.5. Long: direction='long'
    // AND hostile AND score>=8 (floored at the Jun-18 rewrite), TP1 = >= +1.5.
    const [shortRow] = (await sql`
      SELECT COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE o.pct_change <= -1.5)::int AS hits,
             COALESCE(SUM(-o.pct_change), 0)::float AS summove
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.direction = 'short' AND s.market_condition = 'favourable' AND s.score >= 7
    `) as Row[]
    const [longRow] = (await sql`
      SELECT COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE o.pct_change >= 1.5)::int AS hits,
             COALESCE(SUM(o.pct_change), 0)::float AS summove
      FROM scanner_signals s
      JOIN scanner_outcomes o ON o.signal_id = s.id AND o.hours_after = 24
      WHERE s.direction = 'long' AND s.market_condition = 'hostile' AND s.score >= 8
        AND s.scanned_at > '2026-06-18'
    `) as Row[]

    const sCnt = num(shortRow?.cnt) || 0, sHits = num(shortRow?.hits) || 0, sSum = num(shortRow?.summove) || 0
    const lCnt = num(longRow?.cnt) || 0, lHits = num(longRow?.hits) || 0, lSum = num(longRow?.summove) || 0
    const totalCnt = sCnt + lCnt, totalHits = sHits + lHits
    const rate = (hits: number, cnt: number) => (cnt > 0 ? (hits / cnt) * 100 : null)
    const avg  = (sum: number, cnt: number) => (cnt > 0 ? sum / cnt : null)

    // The hero hit-rate + avg move reflect the SELECTED book; the per-side cells
    // always carry the true long/short numbers (the scene shows the relevant ones).
    const heroRate =
      book === "short" ? rate(sHits, sCnt) :
      book === "long"  ? rate(lHits, lCnt) :
                         rate(totalHits, totalCnt)
    const heroAvg =
      book === "short" ? avg(sSum, sCnt) :
      book === "long"  ? avg(lSum, lCnt) :
                         avg(sSum + lSum, totalCnt)

    return {
      combinedHitRate: heroRate,
      long: { hitRate: rate(lHits, lCnt), count: lCnt },
      short: { hitRate: rate(sHits, sCnt), count: sCnt },
      avgMove: heroAvg,
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
  const params = new URL(request.url).searchParams
  const mode = params.get("mode")
  // Which book to broadcast. Default is COMBINED so alerts from BOTH books show
  // without the operator having to switch.
  const bp = params.get("book")
  const book: Book = bp === "long" || bp === "short" ? bp : "combined"
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
  const [regime, sig, closed, record, pnlResult, tickers] = await Promise.all([
    getRegime(sql, book),
    getSignals(sql, book),
    getClosed(sql, book),
    getRecord(sql, book),
    computePnl(sql),
    fetchTickers().catch((e) => { console.error("[live] price source failed:", e instanceof Error ? e.message : e); return null }),
  ])
  if (tickers) { ({ prices, context } = buildPricesAndContext(tickers)); feedOk = prices.length > 0 }

  const slimPnl = (b: PnlBook): LivePnl["combined"] => ({
    balance: Math.round(b.balance * 100) / 100,
    returnPct: Math.round(b.returnPct * 10) / 10,
    trades: b.trades,
    startDate: b.startDate,
    // Cap the sparkline series so the payload stays small on the 5s poll.
    series: b.series.length > 80
      ? b.series.filter((_, i) => i % Math.ceil(b.series.length / 80) === 0).concat(b.series[b.series.length - 1])
      : b.series,
  })
  const pnl: LivePnl = {
    combined: slimPnl(pnlResult.combined),
    short: slimPnl(pnlResult.short),
    long: slimPnl(pnlResult.long),
  }

  const data: LiveData = {
    book,
    regime,
    signals: sig.signals,
    closed,
    latestSignalId: sig.latestSignalId,
    record,
    pnl,
    context,
    prices,
    feedOk,
    ts: Date.now(),
  }
  return NextResponse.json(data, noStore)
}
