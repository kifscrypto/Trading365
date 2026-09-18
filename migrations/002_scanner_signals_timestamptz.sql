-- 002_scanner_signals_timestamptz.sql
-- scanner_signals.scanned_at is `timestamp without time zone`; every consumer
-- (the site stats, the Sep-2026 audit) assumes UTC. Make the assumption
-- structural instead of conventional.
--
-- SAFE because: the column has always been written by NOW() on a UTC server —
-- verified directly: MAX(scanned_at) and NOW()::timestamp agree with
-- NOW()::timestamptz to the minute on live data, so naive values ARE UTC.
-- The USING clause interprets stored values as UTC, so no row shifts.
--
-- Also fixes scanner_outcomes.recorded_at, same situation, same treatment.
--
-- DO NOT run against prod without review. Takes a brief lock; table is ~62k
-- rows, rewrite is seconds, but schedule off-peak anyway.

BEGIN;

ALTER TABLE scanner_signals
  ALTER COLUMN scanned_at TYPE TIMESTAMPTZ
  USING scanned_at AT TIME ZONE 'UTC';

ALTER TABLE scanner_outcomes
  ALTER COLUMN recorded_at TYPE TIMESTAMPTZ
  USING recorded_at AT TIME ZONE 'UTC';

-- Keep the defaults explicit under the new type.
ALTER TABLE scanner_signals  ALTER COLUMN scanned_at  SET DEFAULT NOW();
ALTER TABLE scanner_outcomes ALTER COLUMN recorded_at SET DEFAULT NOW();

COMMIT;
