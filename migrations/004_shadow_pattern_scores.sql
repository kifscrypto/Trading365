-- 004_shadow_pattern_scores.sql
-- Shadow-mode pattern scorer storage (Task 4). FILE ONLY — do not run until the
-- shadow scorer is approved to deploy.
--
-- WHY A SHADOW TABLE. The pattern-v2 research track (analysis/patterns/) asked
-- whether pattern-based entry filters improve expectancy on top of the existing
-- scoring engine. The answer for two families was no (see
-- analysis/patterns/VALIDATION_REPORT.md), but the verdicts are only as good as
-- the sample they were fitted on. A shadow table lets the two surviving
-- candidates (Family C alt/BTC relative strength, Family D short-side extremes)
-- accumulate a genuine out-of-sample record WITHOUT gating a single live signal.
--
-- DESIGN CONSTRAINTS, deliberately chosen:
--   * The scanner NEVER reads this table. Nothing in the firing path, the
--     monitors or the alerts references it. If this table is empty, missing, or
--     broken, every live behaviour is unchanged.
--   * `candidate_id` is a SOFT reference to scanner_signals.id with NO foreign
--     key. A hard FK would let a cleanup/retention job on the candidate pool
--     block or cascade into research rows, and would couple two concerns that
--     have no business being coupled.
--   * Every value column is NULLABLE. A market-data outage for one venue must
--     never fail the shadow write; NULL means "unknown", never fabricated.
--   * Idempotent per (candidate_id, pattern_version): re-running the scorer for
--     the same candidate and the same feature version is a no-op, so a retried
--     cron cannot double-count. A new feature version inserts new rows and
--     leaves the old version's rows interpretable.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS shadow_pattern_scores (
  id                BIGSERIAL PRIMARY KEY,

  -- identity
  candidate_id      INTEGER      NOT NULL,          -- scanner_signals.id (soft ref, no FK)
  pattern_version   TEXT         NOT NULL,          -- e.g. 'pattern-v2.0'
  scanned_at        TIMESTAMPTZ  NOT NULL,          -- the candidate's scan time = the PIT clock
  symbol            TEXT         NOT NULL,
  exchange          TEXT         NOT NULL,
  direction         TEXT         NOT NULL,
  score             INTEGER,                        -- adjusted score at scan time

  -- family flags (the booleans a gate would ever use)
  a_squeeze            BOOLEAN,
  a_range_contraction  BOOLEAN,
  b_aligned            BOOLEAN,
  b_counter            BOOLEAN,
  b_align_struct       BOOLEAN,
  c_aligned            BOOLEAN,
  c_counter            BOOLEAN,
  d_extreme            BOOLEAN,
  d_extreme_against    BOOLEAN,

  -- Family A raw values (4H)
  a_bb_width_pctile  DOUBLE PRECISION,
  a_atr_pctile       DOUBLE PRECISION,
  a_range            DOUBLE PRECISION,
  a_window_bars      INTEGER,

  -- Family B raw values (1D)
  b_ema20            DOUBLE PRECISION,
  b_ema50            DOUBLE PRECISION,
  b_trend_up         BOOLEAN,
  b_trend_down       BOOLEAN,
  b_hh               BOOLEAN,
  b_hl               BOOLEAN,
  b_struct_up        BOOLEAN,
  b_struct_down      BOOLEAN,

  -- Family C raw values (4H + 1D, alt/BTC)
  c_sym_chg_24h        DOUBLE PRECISION,
  c_btc_chg_24h        DOUBLE PRECISION,
  c_rel_perf_24h       DOUBLE PRECISION,
  c_ratio_trend_4h     DOUBLE PRECISION,
  c_ratio_vs_sma20_4h  DOUBLE PRECISION,
  c_ratio_trend_1d     DOUBLE PRECISION,
  c_ratio_vs_sma20_1d  DOUBLE PRECISION,
  c_weak_vs_btc        BOOLEAN,
  c_strong_vs_btc      BOOLEAN,
  c_bear_div           BOOLEAN,
  c_bull_div           BOOLEAN,

  -- Family D raw values
  d_dist_20d_atr     DOUBLE PRECISION,
  d_rsi14_4h         DOUBLE PRECISION,
  d_zscore20_4h      DOUBLE PRECISION,
  d_overbought       BOOLEAN,
  d_oversold         BOOLEAN,

  -- bookkeeping
  bars_4h_available  INTEGER,
  bars_1d_available  INTEGER,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: one row per candidate per feature version.
CREATE UNIQUE INDEX IF NOT EXISTS shadow_pattern_scores_cand_ver_uniq
  ON shadow_pattern_scores (candidate_id, pattern_version);

-- The obvious read pattern: "the shadow record for version X since T".
CREATE INDEX IF NOT EXISTS shadow_pattern_scores_ver_scanned_idx
  ON shadow_pattern_scores (pattern_version, scanned_at DESC);

COMMENT ON TABLE shadow_pattern_scores IS
  'Research-only shadow scores from the pattern-v2 track. NOT read by the scanner, '
  'monitors or alerts. Populated by app/api/scanner/shadow-patterns/route.ts.';
COMMENT ON COLUMN shadow_pattern_scores.candidate_id IS
  'scanner_signals.id, soft reference with no FK on purpose (see migration header).';
