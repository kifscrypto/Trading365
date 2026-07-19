import { neon } from '@neondatabase/serverless'

// Self-audit for the scanner pipeline. Runs the checks we used to do by hand
// every few days, so the system flags its own problems (stale crons, stuck
// rows, duplicate re-fires, regime violations) BEFORE they pile up — instead
// of waiting for someone to spot them. Pure data reads; no writes.

export type Severity = 'critical' | 'warn'
export interface HealthCheck {
  name: string
  ok: boolean
  severity: Severity
  detail: string
}
export interface HealthReport {
  ok: boolean
  ranAt: string
  checks: HealthCheck[]
}

// Thresholds (minutes / hours). Generous multiples of the cron cadence so a
// single missed run never pages — only a genuine stall does.
const STALE_SCAN_MIN = 90      // scan crons run every 15-30m → 3-6 misses
const STALE_OUTCOME_MIN = 180  // outcomes cron is hourly → 3 misses
const STUCK_OPEN_HRS = 72      // trades resolve in ~37h; past this = monitor stall
const LEGACY_CUTOFF_DAYS = 14  // ignore pre-monitor legacy pending beyond this

export async function runScannerHealth(): Promise<HealthReport> {
  const sql = neon(process.env.DATABASE_URL!)
  const q = (text: string) => sql.query(text) as Promise<Record<string, unknown>[]>
  const minutesSince = async (expr: string): Promise<number | null> => {
    const m = (await q(`SELECT EXTRACT(EPOCH FROM (NOW() - ${expr}))/60 AS m`))[0]?.m
    return m == null ? null : Number(m)
  }
  const checks: HealthCheck[] = []
  const add = (name: string, ok: boolean, severity: Severity, detail: string) =>
    checks.push({ name, ok, severity, detail })

  // 1) Scanner still scanning?
  const scanAge = await minutesSince('MAX(scanned_at) FROM scanner_signals')
  add('candidate_scan_fresh', scanAge != null && scanAge <= STALE_SCAN_MIN, 'critical',
    scanAge == null ? 'no scanner_signals rows at all'
      : `last candidate scan ${Math.round(scanAge)}m ago (limit ${STALE_SCAN_MIN}m)`)

  // 2) Outcome grading still running?
  const outAge = await minutesSince('MAX(recorded_at) FROM scanner_outcomes')
  add('outcome_grading_fresh', outAge != null && outAge <= STALE_OUTCOME_MIN, 'critical',
    outAge == null ? 'no scanner_outcomes rows at all'
      : `last outcome recorded ${Math.round(outAge)}m ago (limit ${STALE_OUTCOME_MIN}m)`)

  // 3) Alerts stuck open — monitor not stamping tp_result. Excludes pre-monitor
  //    legacy pending (older than LEGACY_CUTOFF_DAYS).
  for (const [side, table] of [['short', 'telegram_alerts'], ['long', 'telegram_alerts_long']] as const) {
    const rows = await q(
      `SELECT COUNT(*)::int n FROM ${table}
       WHERE tp_result IS NULL
         AND triggered_at < NOW() - INTERVAL '${STUCK_OPEN_HRS} hours'
         AND triggered_at > NOW() - INTERVAL '${LEGACY_CUTOFF_DAYS} days'`)
    const n = rows[0].n as number
    add(`${side}_no_stuck_open`, n === 0, 'warn',
      n === 0 ? 'none' : `${n} ${side} alert(s) open >${STUCK_OPEN_HRS}h — monitor may be lagging`)
  }

  // 4) Duplicate re-fires — the exact condition the open-aware fire guard blocks.
  //    Any >0 here means the guard regressed or was bypassed.
  for (const [side, table] of [['short', 'telegram_alerts'], ['long', 'telegram_alerts_long']] as const) {
    const rows = await q(
      `SELECT COUNT(*)::int n FROM ${table} x
       WHERE EXISTS (SELECT 1 FROM ${table} y
         WHERE y.symbol = x.symbol AND y.id <> x.id
           AND y.triggered_at > x.triggered_at - INTERVAL '7 days'
           AND ((y.triggered_at < x.triggered_at AND (y.closed_at IS NULL OR y.closed_at > x.triggered_at
                 OR x.triggered_at - y.triggered_at < INTERVAL '4 hours'))
                OR (y.triggered_at = x.triggered_at AND y.id < x.id)))`)
    const n = rows[0].n as number
    add(`${side}_no_duplicate_refires`, n === 0, 'warn',
      n === 0 ? 'none' : `${n} stacked ${side} re-fire(s) — dedup guard breached`)
  }

  // 5) Regime violations — shorts must be downtrend, longs uptrend (last 24h).
  const shortBad = (await q(
    `SELECT COUNT(*)::int n FROM telegram_alerts
     WHERE triggered_at > NOW() - INTERVAL '24 hours' AND market_condition <> 'downtrend'`))[0].n as number
  add('short_regime_valid', shortBad === 0, 'warn',
    shortBad === 0 ? 'none' : `${shortBad} short(s) fired in non-downtrend regime (24h)`)
  const longBad = (await q(
    `SELECT COUNT(*)::int n FROM telegram_alerts_long
     WHERE triggered_at > NOW() - INTERVAL '24 hours' AND market_condition <> 'uptrend'`))[0].n as number
  add('long_regime_valid', longBad === 0, 'warn',
    longBad === 0 ? 'none' : `${longBad} long(s) fired in non-uptrend regime (24h)`)

  const ok = checks.every((c) => c.ok)
  const ranAt = (await q(`SELECT to_char(NOW(),'YYYY-MM-DD HH24:MI') t`))[0].t as string
  return { ok, ranAt: `${ranAt} UTC`, checks }
}
