export type Exchange = 'okx' | 'hyperliquid'
export type Direction = 'long' | 'short'
export type SignalStatus = 'open' | 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'tp5' | 'sl' | 'expired'
export type SourceStatus = 'ok' | 'degraded' | 'stale' | 'error'

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ScoreFactor {
  key: string
  label: string
  points: number
  max: number
}

export interface ScoreResult {
  score: number
  adjustedScore: number
  factors: ScoreFactor[]
  skip: boolean
  ema50: number | null
  ema200: number | null
  priceDistance: number | null
}

export interface MarketAsset {
  symbol: string
  exchange: Exchange
  price: number
  change24h: number
  funding: number
  openInterest: number
  volume24h: number
  candles4h: Candle[]
  shortScore?: ScoreResult
  longScore?: ScoreResult
}

export interface MarketContext {
  btcPrice: number | null
  ethPrice: number | null
  btcChange24h: number | null
  ethChange24h: number | null
  btcDominance: number | null
  fearGreed: number | null
  fearGreedLabel: string | null
  regime: 'uptrend' | 'downtrend' | 'neutral' | 'unknown'
  regimeDistance: number | null
}

export interface Signal {
  id: string
  symbol: string
  exchange: Exchange
  side: Direction
  entry: number
  stop: number
  targets: number[]
  score: number
  factors: ScoreFactor[]
  entryTriggers: string[]
  status: SignalStatus
  firedAt: string
  closedAt: string | null
  currentPrice: number
  candles1h: Candle[]
  candles4h: Candle[]
}

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
  tags: string[]
  category: 'markets' | 'derivatives' | 'projects' | 'macro'
}

export interface CalendarEvent {
  id: string
  uid: string
  summary: string
  description: string
  start: string
  end: string | null
  allDay: boolean
  source: string
  importedAt: string
}

export interface SourceHealth {
  id: string
  label: string
  status: SourceStatus
  lastSuccess: string | null
  message: string | null
}

export interface LicensePayload {
  licenseId: string
  orderId: string
  product: 't365-desk'
  majorVersion: 1
  issuedAt: string
  updatesUntil: string
}

export type LicenseStatus = 'unconfigured' | 'trial' | 'active' | 'expired' | 'invalid'

export interface LicenseState {
  status: LicenseStatus
  licenseId: string | null
  updatesUntil: string | null
  trialStartedAt: string
  trialEndsAt: string
}

export interface AppState {
  schemaVersion: 1
  appVersion: string
  dataFile: string
  phase: 'ready' | 'refreshing' | 'degraded'
  message: string | null
  watchlist: string[]
  alertedSignalIds: string[]
  assets: MarketAsset[]
  signals: Signal[]
  news: NewsItem[]
  events: CalendarEvent[]
  market: MarketContext
  sources: SourceHealth[]
  lastUpdated: string | null
  licenseRecord: LicensePayload | null
  trialStartedAt: string
  license: LicenseState
}

export interface Partner {
  id: string
  name: string
  label: string
  offer: string
  url: string
}

export interface T365Api {
  getPartners(): Promise<readonly Partner[]>
  getState(): Promise<AppState>
  refresh(): Promise<AppState>
  toggleWatchlist(symbol: string): Promise<AppState>
  toggleAlert(signalId: string): Promise<AppState>
  importCalendar(): Promise<AppState>
  activateLicense(key: string): Promise<AppState>
  exportBackup(): Promise<{ saved: boolean; path?: string }>
  openExternal(url: string): Promise<void>
  openPartner(partnerId: string): Promise<void>
  onState(callback: (state: AppState) => void): () => void
}

export interface BackupResult {
  saved: boolean
  path?: string
}
