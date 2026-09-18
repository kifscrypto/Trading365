-- 001_scanner_instrumentation.sql
-- Engine v2 instrumentation: BTC fire-time context, gate/fee versioning,
-- MAE alongside MFE, and NET expectancy support.
--
-- NEW ROWS ONLY — no backfill by design (historical rows predate the
-- instrumentation; reconstructing BTC context retroactively belongs to the
-- analysis pipeline, not the prod schema). All columns nullable so existing
-- insert paths keep working until the code that stamps them ships.
--
-- DO NOT run against prod without review. Idempotent (IF NOT EXISTS throughout).

-- ── 1. BTC market snapshot at fire time ──────────────────────────────────────
-- The Sep-2026 audit had to reconstruct BTC context from external klines
-- (approximate). Stamping it at fire time makes regime/BTC-filter audits exact.
ALTER TABLE telegram_alerts
  ADD COLUMN IF NOT EXISTS btc_price_at_fire      NUMERIC(20,8),  -- BTC-USDT (OKX perp, engine's own source)
  ADD COLUMN IF NOT EXISTS btc_24h_change_at_fire NUMERIC(10,4),  -- % change vs 24h before fire
  ADD COLUMN IF NOT EXISTS btc_vs_20d_sma         NUMERIC(10,6),  -- ratio price/sma20: >1 = above, <1 = below, 1.0 = at
  ADD COLUMN IF NOT EXISTS gate_version           TEXT,           -- e.g. 'per-row-v1' — which gate logic allowed this fire
  ADD COLUMN IF NOT EXISTS fee_model_version      TEXT;           -- e.g. 'taker10bps-v1' — which fee model net figures assume

ALTER TABLE telegram_alerts_long
  ADD COLUMN IF NOT EXISTS btc_price_at_fire      NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS btc_24h_change_at_fire NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS btc_vs_20d_sma         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS gate_version           TEXT,
  ADD COLUMN IF NOT EXISTS fee_model_version      TEXT;

-- ── 1b. Regime-conflict flag (log, don't gate) ───────────────────────────────
-- TRUE when the fired alert's regime label and the BTC state disagree
-- (Task 3 finding: aligned-label candidates with BTC 24h > +2% or above the
-- 20d SMA hit TP1 only 11.8% of the time, N=220). Research thread only —
-- populating it never suppresses a fire. Logged now, before the per-row gate
-- change shrinks the observable cohort and contaminates the measurement.
ALTER TABLE telegram_alerts      ADD COLUMN IF NOT EXISTS regime_conflict BOOLEAN;
ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS regime_conflict BOOLEAN;

-- ── 2. MAE (max adverse excursion) alongside existing mfe_pct ────────────────
-- Same window as mfe_pct: fire -> close. shorts: (highest high - entry)/entry;
-- longs: (entry - lowest low)/entry. Positive = how far AGAINST the position
-- price travelled. mfe - mae pairs unlock stop-placement analysis (the audit's
-- section E had to estimate this from mfe alone).
ALTER TABLE telegram_alerts      ADD COLUMN IF NOT EXISTS mae_pct NUMERIC(10,4);
ALTER TABLE telegram_alerts_long ADD COLUMN IF NOT EXISTS mae_pct NUMERIC(10,4);

-- ── 3. Net expectancy ────────────────────────────────────────────────────────
-- Fee/slippage config as data, versioned, so NET figures are reproducible and
-- historical net values stay interpretable when the config changes.
CREATE TABLE IF NOT EXISTS scanner_fee_config (
  version            TEXT PRIMARY KEY,            -- matches fee_model_version on alerts
  taker_fee_bps      NUMERIC(6,2) NOT NULL,       -- per side, e.g. 10.00 = 0.10%
  slippage_bps       NUMERIC(6,2) NOT NULL,       -- assumed per side
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initial house assumption: 0.10% taker + 0.05% slippage per side.
-- net_move_pct formula (documented here AND in code where populated):
--   round_trip_cost_pct = (taker_fee_bps + slippage_bps) * 2 / 100
--   net_move_pct        = move_pct - round_trip_cost_pct
-- move_pct is signed favourable (wins positive, SL negative), so subtracting
-- the round trip works for both signs. Example with defaults:
--   TP1 win:  +1.50 - 0.30 = +1.20% net
--   SL loss:  -2.50 - 0.30 = -2.80% net
INSERT INTO scanner_fee_config (version, taker_fee_bps, slippage_bps, notes)
VALUES ('taker10bps-v1', 10.00, 5.00, 'Initial assumption: 0.10% taker + 0.05% slippage per side, both sides of the round trip')
ON CONFLICT (version) DO NOTHING;

-- Derived NET result on the public receipt, so dashboards (/signals archive,
-- /live) can show net expectancy without recomputing per request.
ALTER TABLE signal_receipts
  ADD COLUMN IF NOT EXISTS net_move_pct   NUMERIC(10,4),  -- move_pct minus round-trip cost; NULL until fee model stamped
  ADD COLUMN IF NOT EXISTS fee_model_version TEXT;
