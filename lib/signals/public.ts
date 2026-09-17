/**
 * Public signal receipts — the canonical, permanent, shareable record behind
 * /signals/[public_id].
 *
 * WHY A SEPARATE TABLE
 * The live scanner keeps its own state in two tables: telegram_alerts (short)
 * and telegram_alerts_long (long). Those tables are scanner internals — their
 * shape changes as the model evolves, they carry no public URL, and a public
 * page must never break because a scanner column moved. signal_receipts is the
 * frozen, write-once *public* projection of a fired signal:
 *
 *   - immutable once created: public_id, side, symbol, entry_price, tp1..tp5,
 *     fired_at and origin are written at FIRE time and are never updated again.
 *     Only the outcome (status / closed_at / move_pct / mfe_pct) evolves, and
 *     only ever by ADDING information. This is what makes the archive auditable.
 *   - one namespace: shorts and longs share one public_id space, so a single
 *     URL space (/signals/[public_id]) can address either book.
 *
 * PUBLIC-AT-FIRE, GATED-BY-TIME
 *   Fired rows are NOT public: /signals only ever renders CLOSED receipts, so
 *   anonymous visitors and Googlebot both see finished, immutable results —
 *   never a live entry. Open signals live behind the account tiers. When a
 *   signal closes, the same public_id becomes a permanent, indexable page.
 *
 * IMPORTANT: this module must not import path aliases (@/…) — it is also run
 * directly by scripts/backfill via `node lib/signals/public.ts`, which cannot
 * resolve them.
 */
import { neon } from '@neondatabase/serverless'

export const SITE = 'https://trading365.org'

export type SignalSide = 'short' | 'long'

/** Mirror of lib/live-types values, plus the two states a public record needs. */
export type ReceiptStatus =
  | 'fired'  // fired, still inside the monitored window — not public yet
  | 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'tp5'  // target touched before the stop
  | 'sl'     // stop touched before any target
  | 'expired' // window closed with neither touched

export type ReceiptOrigin = 'live' | 'backfill'

/** Statuses that are finished, final and therefore publicly indexable. */
export const PUBLIC_STATUSES: ReceiptStatus[] = ['tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'sl', 'expired']

/** A receipt is public once it is no longer 'fired'. */
export function isPublic(status: string): boolean {
  return status !== 'fired'
}

export function isWin(status: string): boolean {
  return status.startsWith('tp')
}

/**
 * The monitor watches a signal for 48h (see WATCH_WINDOW in
 * app/api/scanner/monitor). After that it stops looking, so "no target and no
 * stop within 48h" is the honest definition of expired — it is a statement
 * about the watched window, not a claim that nothing happened later.
 */
export const WATCH_WINDOW_HOURS = 48

/**
 * TP levels are DERIVED from entry at fire time (the scanner never stored them).
 * These constants MUST match the monitor routes exactly:
 *   shorts — app/api/scanner/monitor      TP_FRACTIONS = .985/.975/.96/.94/.92
 *   longs  — app/api/scanner/long-monitor TP_FRACTIONS = 1.015/1.025/1.04
 * `pct` is the move banked by closing at that tier — deterministic, so it is
 * what the receipt reports as the result.
 */
export interface Tier {
  level: 1 | 2 | 3 | 4 | 5
  mult: number
  pct: number
}

export const SHORT_TIERS: Tier[] = [
  { level: 1, mult: 0.985, pct: -1.5 },
  { level: 2, mult: 0.975, pct: -2.5 },
  { level: 3, mult: 0.96, pct: -4.0 },
  { level: 4, mult: 0.94, pct: -6.0 },
  { level: 5, mult: 0.92, pct: -8.0 },
]

export const LONG_TIERS: Tier[] = [
  { level: 1, mult: 1.015, pct: 1.5 },
  { level: 2, mult: 1.025, pct: 2.5 },
  { level: 3, mult: 1.04, pct: 4.0 },
]

interface BookConfig {
  side: SignalSide
  table: string
  /** Per-tier stop flags, deepest first, exactly as the monitor stamps them. */
  flagCases: string
  /** Target price expressions, one per receipt column tp1..tp5 (NULL if unused). */
  tierPrices: string[]
  /**
   * Signed stop distance as a % of entry. A stop ALWAYS resolves as a loss, so
   * this must come out negative for both books — for a short the stop sits
   * above entry, so the naive (stop-entry) would wrongly read as a gain.
   */
  stopExpr: string
}

const SHORT_BOOK: BookConfig = {
  side: 'short',
  table: 'telegram_alerts',
  flagCases: `WHEN a.tp5_alerted THEN 'tp5'
      WHEN a.tp4_alerted THEN 'tp4'
      WHEN a.tp3_alerted THEN 'tp3'
      WHEN a.tp2_alerted THEN 'tp2'
      WHEN a.tp1_alerted THEN 'tp1'`,
  tierPrices: [
    's.entry_price * 0.985',
    's.entry_price * 0.975',
    's.entry_price * 0.96',
    's.entry_price * 0.94',
    's.entry_price * 0.92',
  ],
  stopExpr: '(b.entry_price - b.stop_price) / NULLIF(b.entry_price, 0) * 100',
}

const LONG_BOOK: BookConfig = {
  side: 'long',
  table: 'telegram_alerts_long',
  // The long table has no tp4/tp5 flags — its ladder stops at TP3.
  flagCases: `WHEN a.tp3_alerted THEN 'tp3'
      WHEN a.tp2_alerted THEN 'tp2'
      WHEN a.tp1_alerted THEN 'tp1'`,
  tierPrices: [
    's.entry_price * 1.015',
    's.entry_price * 1.025',
    's.entry_price * 1.04',
    'NULL',
    'NULL',
  ],
  stopExpr: '(b.stop_price - b.entry_price) / NULLIF(b.entry_price, 0) * 100',
}

export const BOOKS: Record<SignalSide, BookConfig> = {
  short: SHORT_BOOK,
  long: LONG_BOOK,
}

export const SIDES: SignalSide[] = ['short', 'long']

export const sql = neon(process.env.DATABASE_URL!)

// ── Schema ──────────────────────────────────────────────────────────────────
let tableReady = false

/**
 * Idempotent DDL, mirroring setupSubscribersTable() in lib/premium.ts. Neon's
 * HTTP driver runs one statement per call, so the indexes are separate calls.
 */
export async function setupReceiptsTable(): Promise<void> {
  if (tableReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS signal_receipts (
      id                 BIGSERIAL PRIMARY KEY,
      public_id          TEXT NOT NULL UNIQUE,
      source_table       TEXT NOT NULL,
      source_id          INTEGER NOT NULL,
      origin             TEXT NOT NULL DEFAULT 'live',   -- live | backfill
      side               TEXT NOT NULL,                  -- long | short
      symbol             TEXT NOT NULL,                  -- e.g. BTWUSDT
      exchange           TEXT NOT NULL,
      timeframe          TEXT NOT NULL DEFAULT '4H',
      entry_price        NUMERIC(20,8) NOT NULL,
      stop_price         NUMERIC(20,8),
      tp1                NUMERIC(20,8),
      tp2                NUMERIC(20,8),
      tp3                NUMERIC(20,8),
      tp4                NUMERIC(20,8),
      tp5                NUMERIC(20,8),
      score              INTEGER,
      raw_score          INTEGER,
      signals            TEXT[] NOT NULL DEFAULT '{}',
      status             TEXT NOT NULL DEFAULT 'fired',
      fired_at           TIMESTAMPTZ NOT NULL,
      closed_at          TIMESTAMPTZ,
      move_pct           NUMERIC(10,4),
      mfe_pct            NUMERIC(10,4),
      visible_to_free_at TIMESTAMPTZ,                    -- Phase 2 (free tier)
      posted_to_x        BOOLEAN NOT NULL DEFAULT FALSE, -- Phase 1 step 8
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT signal_receipts_source_uniq UNIQUE (source_table, source_id)
    )
  `
  // The archive sorts newest-first; the detail page resolves via public_id,
  // which the UNIQUE constraint above already indexes.
  await sql`CREATE INDEX IF NOT EXISTS signal_receipts_fired_idx ON signal_receipts (fired_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS signal_receipts_side_fired_idx ON signal_receipts (side, fired_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS signal_receipts_status_fired_idx ON signal_receipts (status, fired_at DESC)`
  tableReady = true
}

// ── Public record projection ────────────────────────────────────────────────
/** Insert column order — must stay in lock-step with projection(). */
const RECEIPT_COLUMNS = [
  'public_id', 'source_table', 'source_id', 'origin', 'side', 'symbol', 'exchange', 'timeframe',
  'entry_price', 'stop_price', 'tp1', 'tp2', 'tp3', 'tp4', 'tp5',
  'score', 'raw_score', 'signals', 'status', 'fired_at', 'closed_at', 'move_pct', 'mfe_pct', 'updated_at',
] as const

/**
 * The shared CTE carrying ALL mapping logic — the single source of truth for
 * how a scanner row becomes a public receipt. Both the write path (upsert) and
 * the dry-run path (preview) are built from it, so a preview can never disagree
 * with what a write would do.
 *
 * Params: $1 live_id, $2 after_id, $3 limit (+ $4 origin, write path only).
 */
function buildCte(cfg: BookConfig): string {
  return `
WITH base AS (
  SELECT a.*,
    CASE
      -- Deepest target recorded wins, and a recorded target is never
      -- downgraded by a later stop (the precedence the monitor itself uses).
      WHEN a.tp_result ~ '^TP[1-9]$' THEN 'tp' || SUBSTRING(a.tp_result FROM 3)
      ${cfg.flagCases}
      WHEN a.tp_result = 'SL' OR a.stopped THEN 'sl'
      -- Closed with nothing recorded, or past the watched window.
      WHEN a.closed_at IS NOT NULL OR a.triggered_at < NOW() - INTERVAL '${WATCH_WINDOW_HOURS} hours' THEN 'expired'
      ELSE 'fired'
    END AS derived_status
  FROM ${cfg.table} a
  WHERE a.entry_price IS NOT NULL
    AND (
      ($1::int IS NOT NULL AND a.id = $1::int)
      OR ($1::int IS NULL AND a.id > COALESCE($2::int, 0))
    )
  ORDER BY a.id
  LIMIT $3::int
),
src AS (
  SELECT b.*,
    CASE b.derived_status
      WHEN 'tp1' THEN 1.5 WHEN 'tp2' THEN 2.5 WHEN 'tp3' THEN 4.0
      WHEN 'tp4' THEN 6.0 WHEN 'tp5' THEN 8.0
      -- Stop distance is whatever the scanner clamped at fire time (2–4%), so
      -- it is read from the row rather than assumed. Signed by the book: a stop
      -- is always a loss.
      WHEN 'sl' THEN ROUND((${cfg.stopExpr})::numeric, 4)
      ELSE NULL
    END AS derived_move,
    LOWER(REGEXP_REPLACE(REGEXP_REPLACE(b.symbol, 'USDT$', '', 'i'), '[^A-Za-z0-9]', '', 'g'))
      || '-${cfg.side}-'
      || TO_CHAR(b.triggered_at AT TIME ZONE 'UTC', 'YYYYMMDD-HH24MI') AS derived_public_id
  FROM base b
)`
}

/** Receipt projection, in RECEIPT_COLUMNS order. */
function projection(cfg: BookConfig): string[] {
  return [
    's.derived_public_id',
    `'${cfg.table}'`,
    's.id',
    '$4::text',
    `'${cfg.side}'`,
    's.symbol',
    's.exchange',
    `'4H'`,
    's.entry_price',
    's.stop_price',
    ...cfg.tierPrices,
    's.adjusted_score',
    's.score',
    // The receipt keeps the full reason list (setup signals + entry triggers),
    // so every page carries genuinely unique substance rather than a swapped
    // number — that is what keeps 2k+ templated pages out of thin-content
    // territory.
    `COALESCE((
       SELECT ARRAY_AGG(DISTINCT x ORDER BY x)
       FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(s.signals, '[]'::jsonb) || COALESCE(s.entry_signals, '[]'::jsonb)) x
     ), ARRAY[]::text[])`,
    's.derived_status',
    's.triggered_at',
    's.closed_at',
    's.derived_move',
    's.mfe_pct',
    'NOW()',
  ]
}

function buildUpsert(cfg: BookConfig): string {
  const exprs = projection(cfg)
  if (exprs.length !== RECEIPT_COLUMNS.length) {
    throw new Error(
      `signal_receipts projection/column mismatch for ${cfg.side}: ${exprs.length} values for ${RECEIPT_COLUMNS.length} columns`,
    )
  }
  return `${buildCte(cfg)}
INSERT INTO signal_receipts (${RECEIPT_COLUMNS.join(', ')})
SELECT ${exprs.join(',\n       ')}
FROM src s
ON CONFLICT ON CONSTRAINT signal_receipts_source_uniq DO UPDATE SET
  -- ONLY the outcome may ever change. entry_price, targets, fired_at, side,
  -- symbol, public_id and origin are deliberately absent: that write-once
  -- guarantee is what makes the published record auditable.
  status     = EXCLUDED.status,
  closed_at  = EXCLUDED.closed_at,
  move_pct   = EXCLUDED.move_pct,
  mfe_pct    = EXCLUDED.mfe_pct,
  updated_at = NOW()
RETURNING public_id, status, move_pct, closed_at, origin`
}

function buildPreview(cfg: BookConfig): string {
  return `${buildCte(cfg)}
SELECT s.derived_public_id AS public_id, s.id AS source_id, s.symbol, s.exchange,
       s.entry_price, s.stop_price, s.derived_status AS status, s.derived_move AS move_pct,
       s.triggered_at AS fired_at, s.closed_at
FROM src s
ORDER BY s.triggered_at DESC`
}

export interface ReceiptRow {
  public_id: string
  source_id: number
  symbol: string
  exchange: string
  entry_price: string | number
  stop_price: string | number | null
  status: ReceiptStatus
  move_pct: string | number | null
  fired_at: string
  closed_at: string | null
}

export interface SyncResult {
  public_id: string
  status: ReceiptStatus
  move_pct: string | number | null
  closed_at: string | null
  origin: ReceiptOrigin
}

export interface SyncOptions {
  /** Sync a single scanner row (live hooks). */
  id?: number
  /** Backfill cursor: sync rows with id greater than this. */
  afterId?: number
  limit?: number
  origin?: ReceiptOrigin
}

/**
 * Create or refresh the public receipt(s) for a book. Called with `id` from the
 * fire/close hooks and with `afterId`/`limit` from the backfill.
 *
 * Self-healing by design: it inserts a missing receipt and refreshes an
 * existing one's outcome, so a missed fire hook, a retried cron or a re-run
 * backfill all converge on the same row without ever duplicating it.
 */
export async function syncReceipts(side: SignalSide, opts: SyncOptions = {}): Promise<SyncResult[]> {
  await setupReceiptsTable()
  const params = [opts.id ?? null, opts.afterId ?? null, opts.limit ?? 1, opts.origin ?? 'live']
  // sql(text, params) — Neon's ordinary-function form, needed because the SQL is
  // assembled from our own literals (never user input).
  return (await sql(buildUpsert(BOOKS[side]), params)) as unknown as SyncResult[]
}

/**
 * Read-only mapping preview used by the dry run. Writes nothing — not even the
 * signal_receipts table is created, so a preview can never be the thing that
 * puts state into the database. It reads only the scanner's own tables.
 */
export async function previewReceipts(
  side: SignalSide,
  opts: Omit<SyncOptions, 'origin'> = {},
): Promise<ReceiptRow[]> {
  const params = [opts.id ?? null, opts.afterId ?? null, opts.limit ?? 5000]
  return (await sql(buildPreview(BOOKS[side]), params)) as unknown as ReceiptRow[]
}

// ── Live hooks ──────────────────────────────────────────────────────────────
const SOURCE_TABLE: Record<SignalSide, string> = {
  short: 'telegram_alerts',
  long: 'telegram_alerts_long',
}

/** Pre-read used only to detect the fired → resolved transition. */
async function currentReceiptStatus(side: SignalSide, id: number): Promise<ReceiptStatus | null> {
  try {
    const rows = (await sql`
      SELECT status FROM signal_receipts
      WHERE source_table = ${SOURCE_TABLE[side]} AND source_id = ${id}
      LIMIT 1
    `) as unknown as { status: ReceiptStatus }[]
    return rows[0]?.status ?? null
  } catch {
    return null
  }
}

/**
 * Fire/close hook for the scanner crons.
 *
 * NEVER THROWS. A receipts failure must not abort a scanner run, delay a
 * Telegram alert or fail a cron — the same contract lib/discord.ts follows, for
 * the same reason. Failures are logged and recovered by the next sync (or by a
 * backfill re-run), so a dropped row is a delay, never a loss.
 *
 * Returns the public URL when this call made the receipt public for the FIRST
 * time on a live-fired signal (so the caller can ping IndexNow), otherwise null.
 * The network call itself is left to the caller deliberately: this module stays
 * dependency-free so it can also be executed directly by node.
 */
export async function publishReceiptSafe(side: SignalSide, id: number | undefined | null): Promise<string | null> {
  if (!id) return null
  try {
    const before = await currentReceiptStatus(side, id)
    const [row] = await syncReceipts(side, { id })
    if (!row) return null
    const wasPublic = before != null && isPublic(before)
    if (!wasPublic && isPublic(row.status) && row.origin === 'live') {
      return receiptUrl(row.public_id)
    }
    return null
  } catch (err) {
    console.error(`[signals/public] receipt sync failed (${side} ${id}):`, err)
    return null
  }
}

// ── Display helpers (pure — safe to import from anywhere) ───────────────────
/** 'BTWUSDT' → 'BTW' */
export function displayPair(symbol: string): string {
  return symbol.replace(/USDT$/i, '')
}

export function receiptPath(publicId: string): string {
  return `/signals/${publicId}`
}

export function receiptUrl(publicId: string): string {
  return `${SITE}/signals/${publicId}`
}

// ── Read layer ──────────────────────────────────────────────────────────────
export interface Receipt {
  id: number
  public_id: string
  origin: ReceiptOrigin
  side: SignalSide
  symbol: string
  exchange: string
  timeframe: string
  entry_price: string
  stop_price: string | null
  tp1: string | null
  tp2: string | null
  tp3: string | null
  tp4: string | null
  tp5: string | null
  score: number | null
  raw_score: number | null
  signals: string[]
  status: ReceiptStatus
  fired_at: string
  closed_at: string | null
  move_pct: string | null
  mfe_pct: string | null
  created_at: string
  updated_at: string
}

/**
 * Fetch one receipt. Returns null on a missing row OR a missing table, so the
 * page can 404 cleanly in a fresh environment rather than throwing.
 */
export async function getReceipt(publicId: string): Promise<Receipt | null> {
  if (!publicId) return null
  try {
    const rows = await sql`SELECT * FROM signal_receipts WHERE public_id = ${publicId} LIMIT 1`
    return (rows[0] as unknown as Receipt) ?? null
  } catch (err) {
    console.error('[signals/public] getReceipt failed:', err)
    return null
  }
}

/**
 * Historical rows were reconstructed from fire-time logs; only signals fired
 * after go-live were genuinely published at fire time. Both are readable, and the
 * reconstructed ones carry a disclosure note on the page so a reader (and a
 * crawler) can tell the difference — the record only stays trustworthy if the
 * distinction is visible rather than implied. Flipping this to 'true' adds the
 * whole 2,249-page archive to the index in one move.
 */
export function backfillIndexable(): boolean {
  return process.env.SIGNALS_BACKFILL_INDEXABLE === 'true'
}

/** A signal with no outcome yet — still running, or waiting to resolve. */
export function isRunning(r: Pick<Receipt, 'status'>): boolean {
  return r.status === 'fired'
}

/**
 * Indexability, two independent rules:
 *
 *  - a RUNNING signal is never indexable. Its URL is public from fire time (that
 *    is the pre-commitment proof, and it is what /signals/[public_id] now
 *    serves), but the index should only hold completed records: the page's whole
 *    content changes the moment the trade closes, so a mid-flight crawl would be
 *    cached with no result and no reason for anyone to click it.
 *  - reconstructed history joins the index only when SIGNALS_BACKFILL_INDEXABLE
 *    is on.
 */
export function isIndexable(r: Pick<Receipt, 'origin' | 'status'>): boolean {
  if (isRunning(r)) return false
  return r.origin === 'live' || backfillIndexable()
}

export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  fired: 'Open',
  tp1: 'TP1 hit',
  tp2: 'TP2 hit',
  tp3: 'TP3 hit',
  tp4: 'TP4 hit',
  tp5: 'TP5 hit',
  sl: 'Stopped out',
  expired: 'Expired',
}

// ── Formatting ──────────────────────────────────────────────────────────────
// Pinned to UTC + en-GB so a server render and any future client render can
// never disagree (locale-dependent formatting is a hydration-bug generator).
export function fmtPrice(p: string | number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  const n = Number(p)
  if (!isFinite(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  return n.toFixed(6)
}

export function fmtPct(p: string | number | null | undefined, signed = true): string {
  if (p === null || p === undefined) return '—'
  const n = Number(p)
  if (!isFinite(n)) return '—'
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

export function fmtUtc(ts: string | null | undefined, withTime = true): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(d)
  if (!withTime) return date
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return `${date}, ${time} UTC`
}

/** Hours between fire and close — how long the trade was tracked for. */
export function hoursHeld(r: Pick<Receipt, 'fired_at' | 'closed_at'>): number | null {
  if (!r.closed_at) return null
  const ms = new Date(r.closed_at).getTime() - new Date(r.fired_at).getTime()
  if (!isFinite(ms) || ms < 0) return null
  return Math.round((ms / 3_600_000) * 10) / 10
}

/** Only the tiers that exist for this book (the long ladder stops at TP3). */
export function tiersFor(r: Receipt): { level: number; label: string; price: string; pct: number }[] {
  const ladder = r.side === 'short' ? SHORT_TIERS : LONG_TIERS
  const prices = [r.tp1, r.tp2, r.tp3, r.tp4, r.tp5]
  return ladder
    .map((t) => ({ level: t.level as number, label: `TP${t.level}`, price: prices[t.level - 1] as string, pct: t.pct }))
    .filter((t) => t.price != null)
}

// ── Labels & copy ───────────────────────────────────────────────────────────
/** Human label for a stored signal key. Unknown keys degrade to readable text. */
export const SIGNAL_LABEL: Record<string, string> = {
  // short book
  lower_highs: 'Lower highs', weak_lower_highs: 'Weak lower highs',
  heavy_bear_vol: 'Heavy bearish volume', bear_vol: 'Bearish volume',
  high_funding: 'High funding', pos_funding: 'Positive funding', slight_funding: 'Slight funding',
  rsi_ob: 'RSI overbought', rsi_div: 'RSI divergence',
  macd_bear: 'MACD bearish', macd_zero: 'MACD below zero',
  d_200ema: 'Daily 200EMA', d_lh: 'Daily lower highs',
  macd_1h_cross: '1H MACD bearish cross', rsi_1h_falling: '1H RSI falling',
  bearish_engulf: 'Bearish engulfing',
  // long book
  d_above_trend: 'Daily uptrend', d_golden: 'Daily golden cross', d_higher_lows: 'Daily higher lows',
  pullback_zone: 'Pullback zone', near_200ema: 'Near 200EMA', above_200ema: 'Above 200EMA',
  rsi_oversold: 'RSI oversold', rsi_soft: 'RSI soft', macd_pullback: 'MACD pullback',
  low_vol_pullback: 'Low-volume pullback', vol_drying_up: 'Volume drying up',
  funding_negative: 'Negative funding', funding_low: 'Low funding', confluence: 'Confluence',
  reduced_confidence: 'Reduced confidence', rsi_1h_turn_up: '1H RSI turning up',
  engulf_near_200: 'Bullish engulfing at 200EMA', ema_bounce_hl: 'EMA bounce + higher low',
}

export function signalLabel(key: string): string {
  return SIGNAL_LABEL[key] ?? key.replace(/_/g, ' ')
}

export function signalLabels(keys: string[] | null | undefined): string[] {
  return (keys ?? []).map(signalLabel)
}

export function sideLabel(side: SignalSide): string {
  return side === 'short' ? 'Short' : 'Long'
}

/** Result phrase for badges and titles, e.g. "TP1 hit +1.5%". */
export function resultPhrase(r: Pick<Receipt, 'status' | 'move_pct'>): string {
  if (r.status === 'fired') return 'still open'
  if (r.status === 'expired') return 'no resolution within 48h'
  return `${STATUS_LABEL[r.status]} ${fmtPct(r.move_pct)}`
}

/** Compact status for titles: "TP3 +4.0%" / "Stopped out -2.0%" / "Expired". */
function titleResult(r: Pick<Receipt, 'status' | 'move_pct'>): string {
  if (r.status === 'fired') return 'Open'
  if (r.status === 'expired') return 'Expired'
  const tier = r.status.toUpperCase() // tp3 -> TP3
  return `${tier}${r.move_pct != null ? ` ${fmtPct(r.move_pct)}` : ''}`
}

/**
 * Page title. The root layout appends "| Trading365" (~14 chars), so this stays
 * deliberately tight: pair, direction, the RESULT, then the entry price — a
 * result-first ordering means the number survives even if a snippet truncates.
 */
export function receiptTitle(r: Receipt): string {
  return `${displayPair(r.symbol)} ${sideLabel(r.side)} — ${titleResult(r)} · entry ${fmtPrice(r.entry_price)}`
}

/**
 * Meta description. MUST stay under ~155 characters or Google truncates it.
 * The pair, prices and result make it unique, so the boilerplate line that used
 * to sit here (identical on 2,238 pages) is deliberately gone.
 */
export function receiptDescription(r: Receipt): string {
  const tiers = tiersFor(r)
  const head =
    `${displayPair(r.symbol)} ${r.side} on ${r.exchange.toUpperCase()}: entry $${fmtPrice(r.entry_price)}` +
    (r.stop_price ? `, stop $${fmtPrice(r.stop_price)}` : '') +
    (tiers[0] ? `, TP1 $${fmtPrice(tiers[0].price)}` : '')
  return `${head}. Fired ${fmtUtc(r.fired_at, false)}, ${resultPhrase(r)}.`
}

// ── Archive (the public hub at /signals) ────────────────────────────────────
export const ARCHIVE_PAGE_SIZE = 25
/** Hard cap so a crafted ?page= can't ask for a million-row offset. */
const MAX_ARCHIVE_PAGE = 200

export interface ArchiveFilters {
  side?: 'long' | 'short'
  /** 'tp' = any target, 'tp1'..'tp5', 'sl', 'expired' */
  result?: string
  pair?: string
  from?: string
  to?: string
  page: number
}

export type SearchParams = Record<string, string | string[] | undefined>

function firstParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key]
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const RESULT_VALUES = new Set(['tp', 'tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'sl', 'expired'])

/**
 * Accept a date only if it is a real calendar date. A shape-only check is not
 * enough: "2026-13-45" matches the regex but Postgres rejects it outright, which
 * turned a crafted ?to= into an empty archive instead of an ignored filter. The
 * ISO round-trip catches overflow dates (2026-02-30, 2026-13-45) because strict
 * ISO parsing yields Invalid Date for them.
 */
function validDate(s: string | undefined): string | undefined {
  if (!s || !DATE_RE.test(s)) return undefined
  const d = new Date(`${s}T00:00:00Z`)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10) === s ? s : undefined
}

/**
 * Normalise untrusted search params into filters. Everything is validated to a
 * known-good shape here so the SQL below can stay a single static statement.
 */
export function parseArchiveFilters(sp: SearchParams): ArchiveFilters {
  const sideRaw = firstParam(sp, 'side')
  const resultRaw = firstParam(sp, 'result')
  const from = firstParam(sp, 'from')
  const to = firstParam(sp, 'to')
  const pageRaw = Number(firstParam(sp, 'page') ?? 1)
  return {
    side: sideRaw === 'long' || sideRaw === 'short' ? sideRaw : undefined,
    result: resultRaw && RESULT_VALUES.has(resultRaw) ? resultRaw : undefined,
    pair: firstParam(sp, 'pair')?.slice(0, 20),
    from: validDate(from),
    to: validDate(to),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(Math.floor(pageRaw), MAX_ARCHIVE_PAGE) : 1,
  }
}

/**
 * True when the URL is a filtered/paginated view. Those must never be indexed —
 * an unbounded set of filter combinations is the classic crawl-budget sink —
 * so the page marks them noindex,follow and only the clean hub gets indexed.
 */
export function filtersActive(f: ArchiveFilters): boolean {
  return !!(f.side || f.result || f.pair || f.from || f.to || f.page > 1)
}

export interface ArchiveSideStats {
  resolved: number
  wins: number
  losses: number
  expired: number
  hitRate: number | null
  /** Average % banked per WINNING signal (same metric as /live). */
  avgMove: number | null
}

export interface ArchiveStats {
  days: number
  total: number
  resolved: number
  wins: number
  expired: number
  hitRate: number | null
  avgMove: number | null
  short: ArchiveSideStats | null
  long: ArchiveSideStats | null
}

interface ArchiveStatsRow {
  side: SignalSide
  total: number
  resolved: number
  wins: number
  expired: number
  losses: number
  winners: number
  win_move: number
}

function sideStats(r: ArchiveStatsRow | undefined): ArchiveSideStats | null {
  if (!r) return null
  return {
    resolved: r.resolved,
    wins: r.wins,
    losses: r.losses,
    expired: r.expired,
    hitRate: r.resolved > 0 ? (r.wins / r.resolved) * 100 : null,
    avgMove: r.winners > 0 ? r.win_move / r.winners : null,
  }
}

/**
 * Aggregate record over the trailing window.
 *
 * The predicates are deliberately IDENTICAL to /live's getRecord — in
 * particular `closed_at IS NOT NULL` for "resolved", so scratches (signals that
 * never reached a target or the stop inside the watched window) are excluded
 * rather than counted as losses. If either side of the site changes this rule,
 * both must change together or the numbers will contradict each other.
 */
export async function getArchiveStats(days = 30): Promise<ArchiveStats> {
  const empty: ArchiveStats = {
    days, total: 0, resolved: 0, wins: 0, expired: 0, hitRate: null, avgMove: null, short: null, long: null,
  }
  try {
    const rows = (await sql`
      SELECT side,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS resolved,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND status LIKE 'tp%')::int AS wins,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE status = 'sl')::int AS losses,
        COUNT(*) FILTER (WHERE status LIKE 'tp%')::int AS winners,
        COALESCE(SUM(CASE
          WHEN status = 'tp5' THEN 8.0
          WHEN status = 'tp4' THEN 6.0
          WHEN status = 'tp3' THEN 4.0
          WHEN status = 'tp2' THEN 2.5
          WHEN status LIKE 'tp%' THEN 1.5
          ELSE 0
        END) FILTER (WHERE status LIKE 'tp%'), 0)::float AS win_move
      FROM signal_receipts
      WHERE status <> 'fired'
        AND fired_at > NOW() - (${days}::int * INTERVAL '1 day')
      GROUP BY side
    `) as unknown as ArchiveStatsRow[]

    const short = sideStats(rows.find((r) => r.side === 'short'))
    const long = sideStats(rows.find((r) => r.side === 'long'))
    const resolved = (short?.resolved ?? 0) + (long?.resolved ?? 0)
    const wins = (short?.wins ?? 0) + (long?.wins ?? 0)
    const winners = rows.reduce((n, r) => n + (r.winners ?? 0), 0)
    const winMove = rows.reduce((n, r) => n + (r.win_move ?? 0), 0)
    return {
      days,
      total: rows.reduce((n, r) => n + (r.total ?? 0), 0),
      resolved,
      wins,
      expired: (short?.expired ?? 0) + (long?.expired ?? 0),
      hitRate: resolved > 0 ? (wins / resolved) * 100 : null,
      avgMove: winners > 0 ? winMove / winners : null,
      short,
      long,
    }
  } catch (err) {
    console.error('[signals/public] getArchiveStats failed:', err)
    return empty
  }
}

export interface SitemapEntry {
  public_id: string
  lastmod: string
}

/**
 * Receipt URLs for /signals-sitemap.xml.
 *
 * NEVER submit a noindex URL in a sitemap: only rows that are actually
 * indexable are listed, so while SIGNALS_BACKFILL_INDEXABLE is off the sitemap
 * contains live-fired signals only, and the 2,240-row archive joins it
 * automatically the moment that flag is flipped.
 */
export async function getReceiptSitemapEntries(limit = 20000): Promise<SitemapEntry[]> {
  try {
    const rows = (await sql`
      SELECT public_id, COALESCE(closed_at, fired_at)::text AS lastmod
      FROM signal_receipts
      WHERE status <> 'fired'
        AND (${backfillIndexable()}::boolean OR origin = 'live')
      ORDER BY fired_at DESC
      LIMIT ${limit}
    `) as unknown as SitemapEntry[]
    return rows
  } catch (err) {
    console.error('[signals/public] getReceiptSitemapEntries failed:', err)
    return []
  }
}

export interface ArchivePage {
  rows: Receipt[]
  total: number
  page: number
  pageSize: number
  pages: number
}

/**
 * One page of the public archive, newest first.
 *
 * The filter predicates are written as static SQL guarded by `IS NULL` checks
 * (never string-built), so an invalid or hostile query string cannot alter the
 * statement. `COUNT(*) OVER()` returns the filtered total alongside the page, so
 * the pager needs no second query.
 */
export async function getArchivePage(f: ArchiveFilters): Promise<ArchivePage> {
  const pageSize = ARCHIVE_PAGE_SIZE
  const offset = (f.page - 1) * pageSize
  // One WHERE fragment, used by both the page query and the empty-page count, so
  // the two can never drift apart. Every filter is a NULL-guarded predicate
  // rather than concatenated SQL: nothing from the query string is ever
  // interpolated into the statement.
  const where = `
      FROM signal_receipts
      WHERE status <> 'fired'
        AND ($1::text IS NULL OR side = $1::text)
        AND ($2::text IS NULL OR symbol ILIKE '%' || $2::text || '%')
        AND ($3::date IS NULL OR fired_at >= $3::date)
        AND ($4::date IS NULL OR fired_at < ($4::date + INTERVAL '1 day'))
        AND ($5::text IS NULL OR ($5::text = 'tp' AND status LIKE 'tp%') OR status = $5::text)`
  const params = [f.side ?? null, f.pair ?? null, f.from ?? null, f.to ?? null, f.result ?? null]
  try {
    const rows = (await sql(
      `SELECT *, COUNT(*) OVER()::int AS total_count ${where} ORDER BY fired_at DESC, id DESC LIMIT $6::int OFFSET $7::int`,
      [...params, pageSize, offset],
    )) as unknown as (Receipt & { total_count: number })[]

    // COUNT(*) OVER() only exists when a row came back. On an out-of-range page
    // (or a filter that matched nothing) fall back to an explicit count, so
    // `total` is always the truth and the page can never claim the archive is
    // empty when it isn't.
    let total = rows.length > 0 ? rows[0].total_count : 0
    if (rows.length === 0) {
      const [c] = (await sql(`SELECT COUNT(*)::int AS n ${where}`, params)) as unknown as { n: number }[]
      total = c?.n ?? 0
    }
    return { rows, total, page: f.page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
  } catch (err) {
    console.error('[signals/public] getArchivePage failed:', err)
    return { rows: [], total: 0, page: 1, pageSize, pages: 1 }
  }
}

// ── Live (unresolved) signals — the members' view ───────────────────────────
/**
 * How long the free tier waits before an unresolved signal becomes visible.
 *
 * This delay IS the freemium boundary. A winner typically resolves within a few
 * hours (TP1 is only 1.5% away, and the monitor's own data shows resolutions
 * clustered around 1-8h), so members get the actionable window and free accounts
 * see the trade once it has largely played out.
 */
export const FREE_TIER_DELAY_HOURS = Number(process.env.FREE_SIGNAL_DELAY_HOURS ?? 6)

export type OpenReceipt = Receipt & { age_hours: number }

export interface OpenSignals {
  rows: OpenReceipt[]
  /** Firing right now but not yet visible to this viewer — used for upgrade copy. */
  hidden: number
}

/**
 * Unresolved signals: status 'fired' means no target has been hit and the stop
 * has not been touched, i.e. the trade is still running.
 *
 * Visibility is TIME-based, never viewer-based. An anonymous visitor, a signed-in
 * free account and a crawler are all served by the same rule, so there is no
 * cloaking risk and nothing to unpublish later. `visible_to_free_at` overrides
 * the default delay when set, so a single signal can be released early without a
 * schema change.
 */
export async function getOpenSignals(opts: { includeAll: boolean; limit?: number }): Promise<OpenSignals> {
  const limit = opts.limit ?? 50
  const delay = FREE_TIER_DELAY_HOURS
  try {
    const rows = (await sql`
      SELECT *, (EXTRACT(EPOCH FROM (NOW() - fired_at)) / 3600)::float AS age_hours
      FROM signal_receipts
      WHERE status = 'fired'
        AND (
          ${opts.includeAll}::boolean
          OR COALESCE(visible_to_free_at, fired_at + (${delay}::int * INTERVAL '1 hour')) <= NOW()
        )
      ORDER BY fired_at DESC
      LIMIT ${limit}
    `) as unknown as OpenReceipt[]

    let hidden = 0
    if (!opts.includeAll) {
      const counted = (await sql`
        SELECT COUNT(*)::int AS n
        FROM signal_receipts
        WHERE status = 'fired'
          AND COALESCE(visible_to_free_at, fired_at + (${delay}::int * INTERVAL '1 hour')) > NOW()
      `) as unknown as { n: number }[]
      hidden = counted[0]?.n ?? 0
    }
    return { rows, hidden }
  } catch (err) {
    console.error('[signals/public] getOpenSignals failed:', err)
    return { rows: [], hidden: 0 }
  }
}
