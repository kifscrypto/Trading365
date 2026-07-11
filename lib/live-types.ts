// Shared types for the private /live broadcast page and its /api/live feed.
// The verdict category is the ONLY gate-derived value that may appear here —
// never gate inputs, thresholds, scores or intermediate sentiment values.

export type Verdict = "long" | "short" | "neutral"

// Which book the broadcast is currently showing. The operator switches this on
// stream; it filters the feed, closed panel and track record, and the regime
// banner follows it (a book's regime reads "engaged" only when conditions favour
// that book, else "standing down").
export type Book = "combined" | "short" | "long"

export interface LiveSignal {
  id: number // scanner_signals.id — lets the client detect a genuinely new signal
  pair: string
  exchange: string // friendly label e.g. "OKX", shown under the pair on /live
  direction: "long" | "short"
  entry: number
  tp1: boolean
  tp2: boolean
  tp3: boolean
  closeResult: number | null // signed favourable move %, null = still open
  score: number
  time: string // ISO
  live: boolean // fired very recently, still open
}

export interface LiveSideRecord {
  hitRate: number | null
  count: number
}

export interface LiveRecord {
  combinedHitRate: number | null
  long: LiveSideRecord
  short: LiveSideRecord
  avgMove: number | null // realized avg move banked per WINNING signal (TP tiers), %
  avgPeakMove: number | null // avg peak favourable move (MFE) per winning signal, %
}

// Simulated running P&L (virtual $1,000 book, 10% fixed-fraction sizing). The
// broadcast shows all three books at once — combined total plus the separate
// short and long books. `series` is the running balance over time (sparkline).
export interface LivePnlBook {
  balance: number
  returnPct: number
  trades: number
  startDate: string | null // ISO of the first tracked signal
  series: number[]
}
export interface LivePnl {
  combined: LivePnlBook
  short: LivePnlBook
  long: LivePnlBook
}

// MARKET CONTEXT gauges — public market data computed independently of the gate.
export interface LiveContext {
  btcMomentum: number | null // BTC 24h %
  volatility: number | null // BTC 24h high-low range %
  altBreadth: number | null // % of a fixed top-alt list green on 24h
}

export interface LivePrice {
  symbol: string
  price: number
  change24h: number
}

// A signal that has reached its 24h outcome — shown in the "Closed" panel.
export interface LiveClosed {
  id: number
  pair: string
  direction: "long" | "short"
  result: string // e.g. "TP2 +2.5%" or "−1.1%" or "SL −3.0%"
  win: boolean
  stopped: boolean // loss was capped at the protective stop → show an SL badge
  time: string
}

export interface LiveData {
  book: Book // which book this payload was filtered for
  regime: { verdict: Verdict; lastSignalAt: string | null }
  signals: LiveSignal[] // Recent panel: currently-open fires, newest first
  closed: LiveClosed[] // Closed panel: most recent matured results, newest first
  latestSignalId: number | null // newest score>=7 crypto signal id — drives the fire trigger
  record: LiveRecord
  pnl: LivePnl // simulated running P&L — combined + separate short/long books
  context: LiveContext
  prices: LivePrice[]
  feedOk: boolean // price source returned data this request
  ts: number
}
