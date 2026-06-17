// Shared types for the private /live broadcast page and its /api/live feed.
// The verdict category is the ONLY gate-derived value that may appear here —
// never gate inputs, thresholds, scores or intermediate sentiment values.

export type Verdict = "long" | "short" | "neutral"

export interface LiveSignal {
  pair: string
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
  capturedPct: number // cumulative favourable move captured, %
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

export interface LiveData {
  regime: { verdict: Verdict; lastSignalAt: string | null }
  signals: LiveSignal[]
  record: LiveRecord
  context: LiveContext
  prices: LivePrice[]
  ts: number
}
