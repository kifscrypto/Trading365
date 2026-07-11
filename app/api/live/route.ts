import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { HEADERS, EXCHANGE_LABEL, type SqlClient } from "@/app/api/scanner/_core"
import { computePnl, type PnlBook } from "@/lib/scanner-pnl"
import type {
  LiveData, LiveSignal, LiveClosed, LiveRecord, LiveContext, LivePrice, LivePnl, Verdict, Book,
} from "@/lib/live-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Price board (matches the scene). Alt-breadth uses a wider fixed top-alt list.
const PRICE_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"]
const ALT_BREADTH = [
  "SOL", "BNB", "XRP", "DOGE", "AVAX", "ADA", "LINK", "TRX", "DOT", "LTC",
  "BCH", "NEAR", "APT", "ARB", "OP", "INJ", "SUI", "TIA", "SEI", "RUNE",
]

// market_condition (gate OUTPUT category) → broadcast verdict. The only
// gate-derived value allowed out; gate INPUTS are never read.
function toVerdict(mc: string | null | undefined): Verdict {
  if (mc === "downtrend") return "short"
  if (mc === "uptrend") return "long"
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
      SELECT id, symbol, exchange, direction, entry_price, score, triggered_at,
             tp1_alerted, tp2_alerted, tp3_alerted, closed_at FROM (
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol, exchange,
               'short'::text AS direction, entry_price, adjusted_score AS score, triggered_at,
               tp1_alerted, tp2_alerted, tp3_alerted, closed_at
        FROM telegram_alerts
        WHERE triggered_at > NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'short')
          AND stopped = FALSE
          AND NOT (tp1_alerted AND tp2_alerted AND tp3_alerted AND tp4_alerted AND tp5_alerted)
        UNION ALL
        SELECT (EXTRACT(EPOCH FROM triggered_at) * 1000)::bigint AS id, symbol, exchange,
               'long'::text AS direction, entry_price, adjusted_score AS score, triggered_at,
               tp1_alerted, tp2_alerted, tp3_alerted, closed_at
        FROM telegram_alerts_long
        WHERE triggered_at > NOW() - INTERVAL '24 hours' AND (${book} = 'combined' OR ${book} = 'long')
          AND stopped = FALSE
          AND NOT (tp1_alerted AND tp2_alerted AND tp3_alerted)
      ) a
      -- Surface live trades by most-recent ACTIVITY: a fresh fire (no hit yet)
      -- sorts by triggered_at; a trade that just touched a TP has closed_at set
      -- to that moment, so it bubbles up and its green badges become visible.
      ORDER BY COALESCE(closed_at, triggered_at) DESC
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
        exchange: EXCHANGE_LABEL[String(r.exchange)] ?? "OKX",
        direction: (r.direction as string) === "long" ? "long" : "short",
        entry: num(r.entry_price),
        // Live TP state from the monitor's per-trade flags (the fallback path
        // reads scanner_signals, which lacks these → undefined → false).
        tp1: Boolean(r.tp1_alerted), tp2: Boolean(r.tp2_alerted), tp3: Boolean(r.tp3_alerted),
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

    // TRUE last resort — runs ONLY because the alert tables returned zero rows
    // for this book in the last 24h (never unioned/mixed with alerts above).
    // Restricted to alert-grade candidates (score >= 7) so the panel never shows
    // sub-threshold 3-6 noise dressed up as signals.
    const fb = (await sql`
      SELECT (EXTRACT(EPOCH FROM scanned_at) * 1000)::bigint AS id, symbol, exchange, direction,
             price_at_signal AS entry_price, score, scanned_at
      FROM scanner_signals
      WHERE scanned_at > NOW() - INTERVAL '24 hours'
        AND score >= 7
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

// Fallback SL magnitude when entry/stop aren't both available to compute it.
const STOP_LOSS_PCT = 3
// Favourable move captured at each TP level (same magnitude both directions).
const TP_CAPTURE: Record<string, number> = { TP1: 1.5, TP2: 2.5, TP3: 4.0, TP4: 6.0, TP5: 8.0 }

// ── Closed panel: REAL-TIME. A signal is CLOSED the instant the monitor records
// a TP touch or stop breach on the alert row (telegram_alerts.closed_at /
// tp_result / stopped) — NOT when the 24h outcomes cron runs. Long table is
// unioned for forward-compat (long TP monitoring not implemented yet, so it has
// no closed rows). id = closed_at epoch-ms, so ORDER BY id DESC == closed_at DESC.
async function getClosed(sql: SqlClient, book: Book): Promise<LiveClosed[]> {
  try {
    const rows = (await sql`
      SELECT id, symbol, direction, tp_result, stopped, entry_price, stop_price FROM (
        SELECT (EXTRACT(EPOCH FROM closed_at) * 1000)::bigint AS id, symbol,
               'short'::text AS direction, tp_result, stopped, entry_price, stop_price
        FROM telegram_alerts
        WHERE closed_at IS NOT NULL AND (${book} = 'combined' OR ${book} = 'short')
          -- Exclude the Jul 2–5 shorts fired into a bullish BTC under the pre-±3
          -- regime miscalibration. They were really sent, but the corrected
          -- strategy wouldn't have fired them, so they're kept out of the record
          -- to match the simulated P&L (which also drops them). See scanner-pnl.
          AND NOT (triggered_at >= '2026-07-02' AND triggered_at < '2026-07-06')
        UNION ALL
        SELECT (EXTRACT(EPOCH FROM closed_at) * 1000)::bigint AS id, symbol,
               'long'::text AS direction, tp_result, FALSE AS stopped, entry_price, stop_price
        FROM telegram_alerts_long
        WHERE closed_at IS NOT NULL AND (${book} = 'combined' OR ${book} = 'long')
      ) c
      ORDER BY id DESC
      LIMIT 10
    `) as Row[]
    return rows.map((r) => {
      const direction = (r.direction as string) === "long" ? "long" : "short"
      const tp = (r.tp_result as string | null) ?? null
      let result: string, win: boolean, stopped: boolean
      if (tp && tp.startsWith("TP")) {
        // A TP was reached → a win, even if the stop was later touched.
        result = `${tp} +${(TP_CAPTURE[tp] ?? 1.5).toFixed(1)}%`
        win = true
        stopped = false
      } else {
        // Stopped out with no TP reached → show the stop magnitude.
        const entry = num(r.entry_price), stop = num(r.stop_price)
        const slPct = direction === "short" ? ((stop - entry) / entry) * 100 : ((entry - stop) / entry) * 100
        const mag = Number.isFinite(slPct) && slPct > 0 ? slPct : STOP_LOSS_PCT
        result = `SL −${mag.toFixed(1)}%`
        win = false
        stopped = true
      }
      const ms = num(r.id)
      return {
        id: ms,
        pair: String(r.symbol).replace("USDT", ""),
        direction,
        result,
        win,
        stopped,
        time: new Date(ms).toISOString(),
      }
    })
  } catch {
    return []
  }
}

// ── 30-day track record: per-book hit rate + counts + AVERAGE move/signal ────
async function getRecord(sql: SqlClient, book: Book): Promise<LiveRecord> {
  const empty: LiveRecord = { combinedHitRate: null, long: { hitRate: null, count: 0 }, short: { hitRate: null, count: 0 }, avgMove: null, avgPeakMove: null }
  try {
    // REAL-TIME track record, read from fired alerts the moment the monitor
    // stamps them — matches the Closed panel, not the 24h outcomes cron.
    //   win      = closed_at set AND tp_result is a TP level (TP1+)
    //   loss(SL) = closed_at set AND tp_result = 'SL'
    // Hit rate = wins / (wins + SL) — i.e. win rate of trades that actually
    // RESOLVED to a TP or a stop. Signals that never hit either (still open, or
    // chopped sideways past the 48h window) are NOT counted as losses — they're
    // scratches and are excluded. `cnt` below = resolved total (closed_at set).
    // winmove/wincnt drive "Avg move / WINNING signal": the average % a winner
    // banks, over resolved winners only (the hit rate above already conveys how
    // often we win). TP tiers cover TP1–TP5 — the old CASE stopped at TP3, so
    // TP4 (+6) and TP5 (+8) winners were miscounted as +1.5, which understated
    // the figure badly. mfe_pct (true peak move) is too sparsely populated to
    // headline (0 longs), so this TP-tier realized move is the reliable metric.
    const [shortRow] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND tp_result LIKE 'TP%')::int AS hits,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS cnt,
        COUNT(*) FILTER (WHERE tp_result LIKE 'TP%')::int AS wincnt,
        COALESCE(SUM(CASE
          WHEN tp_result = 'TP5' THEN 8.0
          WHEN tp_result = 'TP4' THEN 6.0
          WHEN tp_result = 'TP3' THEN 4.0
          WHEN tp_result = 'TP2' THEN 2.5
          WHEN tp_result LIKE 'TP%' THEN 1.5
          ELSE 0
        END) FILTER (WHERE tp_result LIKE 'TP%'), 0)::float AS winmove,
        COUNT(*) FILTER (WHERE tp_result LIKE 'TP%' AND mfe_pct IS NOT NULL)::int AS peakcnt,
        COALESCE(SUM(mfe_pct) FILTER (WHERE tp_result LIKE 'TP%' AND mfe_pct IS NOT NULL), 0)::float AS peaksum
      FROM telegram_alerts
      WHERE triggered_at > NOW() - INTERVAL '30 days'
    `) as Row[]
    const [longRow] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND tp_result LIKE 'TP%')::int AS hits,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS cnt,
        COUNT(*) FILTER (WHERE tp_result LIKE 'TP%')::int AS wincnt,
        COALESCE(SUM(CASE
          WHEN tp_result = 'TP5' THEN 8.0
          WHEN tp_result = 'TP4' THEN 6.0
          WHEN tp_result = 'TP3' THEN 4.0
          WHEN tp_result = 'TP2' THEN 2.5
          WHEN tp_result LIKE 'TP%' THEN 1.5
          ELSE 0
        END) FILTER (WHERE tp_result LIKE 'TP%'), 0)::float AS winmove,
        COUNT(*) FILTER (WHERE tp_result LIKE 'TP%' AND mfe_pct IS NOT NULL)::int AS peakcnt,
        COALESCE(SUM(mfe_pct) FILTER (WHERE tp_result LIKE 'TP%' AND mfe_pct IS NOT NULL), 0)::float AS peaksum
      FROM telegram_alerts_long
      WHERE triggered_at > NOW() - INTERVAL '30 days' AND triggered_at >= '2026-06-18'
    `) as Row[]

    const sCnt = num(shortRow?.cnt) || 0, sHits = num(shortRow?.hits) || 0
    const sWin = num(shortRow?.wincnt) || 0, sWinMove = num(shortRow?.winmove) || 0
    const sPeakN = num(shortRow?.peakcnt) || 0, sPeakSum = num(shortRow?.peaksum) || 0
    const lCnt = num(longRow?.cnt) || 0, lHits = num(longRow?.hits) || 0
    const lWin = num(longRow?.wincnt) || 0, lWinMove = num(longRow?.winmove) || 0
    const lPeakN = num(longRow?.peakcnt) || 0, lPeakSum = num(longRow?.peaksum) || 0
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
      book === "short" ? avg(sWinMove, sWin) :
      book === "long"  ? avg(lWinMove, lWin) :
                         avg(sWinMove + lWinMove, sWin + lWin)
    // Avg PEAK favourable move (MFE) per winning signal, over winners that have
    // mfe_pct populated (non-OKX symbols backfill forward via the monitors).
    const heroPeak =
      book === "short" ? avg(sPeakSum, sPeakN) :
      book === "long"  ? avg(lPeakSum, lPeakN) :
                         avg(sPeakSum + lPeakSum, sPeakN + lPeakN)

    return {
      combinedHitRate: heroRate,
      long: { hitRate: rate(lHits, lCnt), count: lCnt },
      short: { hitRate: rate(sHits, sCnt), count: sCnt },
      avgMove: heroAvg,
      avgPeakMove: heroPeak,
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
