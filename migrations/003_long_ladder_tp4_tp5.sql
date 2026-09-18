-- 003_long_ladder_tp4_tp5.sql
-- Long ladder extension (Task 2 backtest: +0.15pp expectancy/signal, monotone
-- improvement, analysis/task2_ladder_backtest.md). The long monitor tracks
-- TP touches via per-tier boolean flags; extending the ladder to TP4/TP5
-- (entry x 1.06 / 1.08, mirroring shorts' 0.94 / 0.92) needs the two flags
-- the short book already has.
--
-- DO NOT run before 001. Idempotent. Existing rows keep DEFAULT FALSE —
-- historically no long was ever marked TP4/TP5, which is exactly correct.

ALTER TABLE telegram_alerts_long
  ADD COLUMN IF NOT EXISTS tp4_alerted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tp5_alerted BOOLEAN NOT NULL DEFAULT FALSE;
