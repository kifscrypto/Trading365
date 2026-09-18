import { neon } from '@neondatabase/serverless'
import { verifyAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'
import {
  computePatternFeatures, loadPrep, PATTERN_VERSION,
  type Prep,
} from '@/lib/patterns/features'

/**
 * SHADOW-MODE pattern scorer — pattern-v2 research track (Task 4).
 *
 * Computes Family A-D features for candidates the scanner has already logged and
 * writes them to `shadow_pattern_scores`. READ-ONLY with respect to every
 * production table: the only writes are INSERTs into the shadow table.
 *
 *   *** NOTHING HERE GATES A LIVE SIGNAL. ***
 * The scanner, the entry routes, the monitors and the alert senders do not import
 * this file and never read `shadow_pattern_scores`. If this endpoint is never
 * called, or the shadow table does not exist, live behaviour is byte-for-byte
 * unchanged. Promotion of any family out of shadow mode is a separate, human
 * decision (see analysis/patterns/VALIDATION_REPORT.md).
 *
 * Point-in-time correctness: the clock is each candidate's own `scanned_at`, and
 * `computePatternFeatures` only ever reads bars whose CLOSE TIME is <= that
 * timestamp (see lib/patterns/features.ts and analysis/patterns/FEATURES.md §0).
 * Using `NOW()` here would be a leak.
 *
 * Idempotent per (candidate_id, pattern_version) via ON CONFLICT DO NOTHING, so a
 * retried or overlapping cron run cannot double-count.
 *
 * Query params:
 *   dry=true        compute and return a sample, write nothing
 *   limit=N         candidates per run (default 150, max 400)
 *   hours=N         look back N hours of scans (default 6, max 48)
 *   min_score=N     candidate score floor (default 7 = the firing bar)
 */

/** NaN -> NULL. Never persist a fabricated number. */
function nn(v: number): number | null {
  return Number.isFinite(v) ? v : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = url.searchParams.get('cron') === 'true'
  const dry = url.searchParams.get('dry') === 'true'
  const limit = Math.min(400, Math.max(1, Number(url.searchParams.get('limit') ?? 150)))
  const hours = Math.min(48, Math.max(1, Number(url.searchParams.get('hours') ?? 6)))
  const minScore = Number(url.searchParams.get('min_score') ?? 7)

  const auth = request.headers.get('authorization')
  const hasSession = await verifyAdmin(request)
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}` && !hasSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = neon(process.env.DATABASE_URL!)

  try {
    // Never DDL from a research route: if the migration has not been applied,
    // say so plainly instead of silently creating schema.
    const [reg] = await sql`SELECT to_regclass('public.shadow_pattern_scores')::text AS t`
    if (!reg?.t && !dry) {
      return NextResponse.json({
        ok: false,
        error: 'shadow_pattern_scores does not exist — apply migrations/004_shadow_pattern_scores.sql first',
        hint: 'add ?dry=true to compute without writing',
      }, { status: 409 })
    }

    const candidates = await sql`
      SELECT s.id, s.symbol, s.exchange, s.direction, s.score,
             s.scanned_at::text AS scanned_at,
             EXTRACT(EPOCH FROM s.scanned_at) * 1000 AS scanned_ms
      FROM scanner_signals s
      WHERE s.scanned_at > NOW() - make_interval(hours => ${hours})
        AND s.score >= ${minScore}
        AND NOT EXISTS (
          SELECT 1 FROM shadow_pattern_scores x
          WHERE x.candidate_id = s.id AND x.pattern_version = ${PATTERN_VERSION}
        )
      ORDER BY s.scanned_at DESC
      LIMIT ${limit}
    `

    const prepCache = new Map<string, Prep>()
    const computed: Record<string, unknown>[] = []
    const errors: string[] = []
    let inserted = 0

    for (const c of candidates) {
      const key = `${c.exchange}__${c.symbol}`
      try {
        if (!prepCache.has(key)) {
          prepCache.set(key, await loadPrep(c.exchange as string, c.symbol as string))
        }
        const f = computePatternFeatures(
          c.direction === 'long' ? 'long' : 'short',
          Math.floor(Number(c.scanned_ms)),
          prepCache.get(key)!,
        )
        if (computed.length < 3) computed.push({ candidate_id: c.id, ...f })

        if (dry) continue
        const r = await sql`
          INSERT INTO shadow_pattern_scores (
            candidate_id, pattern_version, scanned_at, symbol, exchange, direction, score,
            a_squeeze, a_range_contraction, b_aligned, b_counter, b_align_struct,
            c_aligned, c_counter, d_extreme, d_extreme_against,
            a_bb_width_pctile, a_atr_pctile, a_range, a_window_bars,
            b_ema20, b_ema50, b_trend_up, b_trend_down, b_hh, b_hl, b_struct_up, b_struct_down,
            c_sym_chg_24h, c_btc_chg_24h, c_rel_perf_24h, c_ratio_trend_4h,
            c_ratio_vs_sma20_4h, c_ratio_trend_1d, c_ratio_vs_sma20_1d,
            c_weak_vs_btc, c_strong_vs_btc, c_bear_div, c_bull_div,
            d_dist_20d_atr, d_rsi14_4h, d_zscore20_4h, d_overbought, d_oversold,
            bars_4h_available, bars_1d_available
          ) VALUES (
            ${c.id}, ${PATTERN_VERSION}, ${c.scanned_at}, ${c.symbol}, ${c.exchange},
            ${c.direction}, ${c.score},
            ${f.a_squeeze}, ${f.a_range_contraction}, ${f.b_aligned}, ${f.b_counter},
            ${f.b_align_struct}, ${f.c_aligned}, ${f.c_counter}, ${f.d_extreme},
            ${f.d_extreme_against},
            ${nn(f.a_bb_width_pctile)}, ${nn(f.a_atr_pctile)}, ${nn(f.a_range)}, ${f.a_window_bars},
            ${nn(f.b_ema20)}, ${nn(f.b_ema50)}, ${f.b_trend_up}, ${f.b_trend_down},
            ${f.b_hh}, ${f.b_hl}, ${f.b_struct_up}, ${f.b_struct_down},
            ${nn(f.c_sym_chg_24h)}, ${nn(f.c_btc_chg_24h)}, ${nn(f.c_rel_perf_24h)},
            ${nn(f.c_ratio_trend_4h)}, ${nn(f.c_ratio_vs_sma20_4h)}, ${nn(f.c_ratio_trend_1d)},
            ${nn(f.c_ratio_vs_sma20_1d)},
            ${f.c_weak_vs_btc}, ${f.c_strong_vs_btc}, ${f.c_bear_div}, ${f.c_bull_div},
            ${nn(f.d_dist_20d_atr)}, ${nn(f.d_rsi14_4h)}, ${nn(f.d_zscore20_4h)},
            ${f.d_overbought}, ${f.d_oversold},
            ${f.bars_4h_available}, ${f.bars_1d_available}
          )
          ON CONFLICT (candidate_id, pattern_version) DO NOTHING
        `
        inserted += Array.isArray(r) ? r.length : 0
      } catch (e) {
        // One venue outage must never fail the whole run — NULL means unknown.
        errors.push(`${c.exchange}/${c.symbol}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      pattern_version: PATTERN_VERSION,
      dry,
      candidates: candidates.length,
      computed: candidates.length - errors.length,
      inserted,
      errors: errors.length,
      error_sample: errors.slice(0, 5),
      sample: computed,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[shadow-patterns]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
