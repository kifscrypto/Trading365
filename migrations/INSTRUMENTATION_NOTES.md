# Instrumentation Notes — Engine v2

Migration **files** only — not run against prod. `001_scanner_instrumentation.sql` adds nullable columns (safe: existing insert paths keep working until stamping code ships); `002_scanner_signals_timestamptz.sql` fixes the timezone-naive timestamps. New rows only; no backfill.

The codebase has no ORM — data access is raw `neon` SQL in `app/api/scanner/*` and `lib/*`, so there are no model files to update. The stamping code (where each field gets populated) is listed per field below, for when you approve the changes.

## `btc_price_at_fire`, `btc_24h_change_at_fire`, `btc_vs_20d_sma` (both alert tables)

**What:** BTC-USDT price, its 24h change, and price/SMA20 ratio at the moment the alert fires. Ratio instead of boolean so future audits can bucket by *distance* from the mean, not just above/below.
**Stamped in:** `app/api/scanner/entries/route.ts` / `long-entries/route.ts` at insert time — the BTC context is already computed in `fetchBtcSentimentData` (`_core.ts`); it just isn't persisted on the alert row.
**Unlocks:** exact regime/BTC-filter analysis (audit section C ran on approximate external klines), plus per-signal BTC context on public receipt pages. Makes every future meta-filter question answerable with one GROUP BY instead of an external data join.

## `gate_version` (both alert tables)

**What:** which gate logic allowed the fire, e.g. `per-row-v1` (the Sep-18 fix), earlier rows implicitly `watchlist[0]-v0`.
**Stamped in:** the entries routes, same insert.
**Unlocks:** the audit found regime-label vocabulary drift made history hard to slice. Versioning the *gate decision* (not just the label) means the next audit can compare gate generations head-to-head and any gate regression is attributable to a version, not archaeology.

## `fee_model_version` (alerts + receipts) and `scanner_fee_config`

**What:** versioned fee/slippage assumptions as data. Initial row: `taker10bps-v1` = 0.10% taker + 0.05% slippage per side. Formula (also in the SQL file): `net_move_pct = move_pct − (taker_fee_bps + slippage_bps) × 2 / 100`. TP1 win: +1.50 → +1.20 net; a −2.5% SL: −2.80 net.
**Unlocks:** **net expectancy.** The audit's headline +0.94% gross expectancy shrinks to ~+0.64% net at these defaults — and TP1-only exit plans go firmly negative, which changed the ranking of some audit hypotheses. Dashboards (`/signals`, `/live`) can show net without per-request math, and historical rows stay interpretable when fees change (new version row, old rows keep their version).

## `net_move_pct` (signal_receipts)

**What:** move_pct minus round-trip cost, stamped when the receipt's outcome resolves (monitor close path), NULL until the fee model version is set.
**Stamped in:** `app/api/scanner/monitor` + `long-monitor` where `move_pct` is derived, or in the `syncReceipts` projection in `lib/signals/public.ts`.
**Unlocks:** public pages that advertise net-of-fees results — the honest number, and the one that survives scrutiny.

## `mae_pct` (both alert tables)

**What:** max adverse excursion, fire→close, same window as the existing `mfe_pct`. Shorts: (highest high − entry)/entry; longs: (entry − lowest low)/entry.
**Stamped in:** the monitors alongside `mfe_pct` (same candle fetch), plus the `scripts/backfill-mae.mjs` equivalent of `backfill-mfe.mjs` if you ever want history.
**Unlocks:** real stop-placement analysis. The audit's section E could only *estimate* the SL leak from mfe (answer: barely any — losers had 0.2–0.35% median mfe). With mfe/mae pairs per signal you can answer "would a wider/tighter stop have helped?" exactly, per regime and per stop-distance bucket — the open question behind the audit's 2%-vs-4% stop finding.

## `scanned_at` / `recorded_at` → timestamptz (migration 002)

**What:** type change with `USING ... AT TIME ZONE 'UTC'`. Verified safe: MAX(scanned_at) agrees with NOW()::timestamp to the minute on live data, so stored naive values are UTC and no row shifts.
**Unlocks:** joins between the candidate pool and timestamptz tables stop depending on a convention; the next audit doesn't need the "assumed UTC" caveat.

## Suggested rollout order

1. Review + run 002 (done 2026-09-18 — verified MAX(scanned_at) unchanged and the 10:30 UTC cron inserted successfully post-conversion).
2. Run 001 (done 2026-09-18 — backup in `analysis/backup-2026-09-18/` taken first).
3. Run 003 (done 2026-09-18 — long TP4/TP5 flags).
4. Ship stamping code (done: entries routes stamp BTC/gate/fee/regime_conflict; monitors stamp mae_pct; receipts stamp net_move_pct).
