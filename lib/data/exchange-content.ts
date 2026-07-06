/**
 * Merge layer for editable exchange content. The canonical data still lives in
 * lib/data/exchanges.ts (the code defaults); this overlays two admin-managed
 * sources on top so the customer-facing bonus surfaces can be edited without a
 * deploy:
 *   • referral link  ← `affiliate_links.affiliate_url`  (managed at /admin/affiliate-links)
 *   • bonus + stats  ← `exchange_overrides`             (managed at /admin/exchanges)
 *
 * Reads are resilient: any DB error falls back to the static list, so pages
 * never break if the tables are missing.
 */
import { sql } from "@/lib/db"
import { exchanges as staticExchanges, getExchangeBySlug as staticBySlug } from "@/lib/data/exchanges"
import type { Exchange } from "@/lib/data/types"

// Columns editable in /admin/exchanges (null/absent = use the code default).
export interface ExchangeOverrideRow {
  slug: string
  bonus: string | null
  bonus_details: string | null
  rating: number | string | null
  leverage: string | null
  trading_pairs: number | null
  maker_fee: string | null
  kyc: boolean | null
}

export async function ensureExchangeOverridesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS exchange_overrides (
      slug          TEXT PRIMARY KEY,
      bonus         TEXT,
      bonus_details TEXT,
      rating        NUMERIC,
      leverage      TEXT,
      trading_pairs INTEGER,
      maker_fee     TEXT,
      kyc           BOOLEAN,
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `
}

function applyOverride(ex: Exchange, ov: ExchangeOverrideRow | undefined, url: string | undefined): Exchange {
  return {
    ...ex,
    referralLink: url || ex.referralLink,
    bonus: ov?.bonus ?? ex.bonus,
    bonusDetails: ov?.bonus_details ?? ex.bonusDetails,
    rating: ov?.rating != null && ov.rating !== "" ? Number(ov.rating) : ex.rating,
    leverage: ov?.leverage ?? ex.leverage,
    tradingPairs: ov?.trading_pairs ?? ex.tradingPairs,
    fees: { ...ex.fees, maker: ov?.maker_fee ?? ex.fees.maker },
    kyc: ov?.kyc != null ? Boolean(ov.kyc) : ex.kyc,
  }
}

async function loadMaps(): Promise<{ ovMap: Map<string, ExchangeOverrideRow>; urlMap: Map<string, string> }> {
  await ensureExchangeOverridesTable()
  const ovs = (await sql`SELECT * FROM exchange_overrides`) as unknown as ExchangeOverrideRow[]
  let links: Array<{ slug: string; affiliate_url: string }> = []
  try {
    links = (await sql`SELECT slug, affiliate_url FROM affiliate_links WHERE affiliate_url IS NOT NULL AND affiliate_url <> ''`) as unknown as Array<{ slug: string; affiliate_url: string }>
  } catch {
    links = [] // affiliate_links table may not exist yet
  }
  return {
    ovMap: new Map(ovs.map((r) => [r.slug, r] as const)),
    urlMap: new Map(links.map((r) => [r.slug, r.affiliate_url] as const)),
  }
}

/** All exchanges (incl. defunct — consumers filter) with admin overrides applied. */
export async function getMergedExchanges(): Promise<Exchange[]> {
  try {
    const { ovMap, urlMap } = await loadMaps()
    return staticExchanges.map((ex) => applyOverride(ex, ovMap.get(ex.slug), urlMap.get(ex.slug)))
  } catch {
    return staticExchanges
  }
}

export async function getMergedExchangeBySlug(slug: string): Promise<Exchange | undefined> {
  const ex = staticBySlug(slug)
  if (!ex) return undefined
  try {
    const { ovMap, urlMap } = await loadMaps()
    return applyOverride(ex, ovMap.get(slug), urlMap.get(slug))
  } catch {
    return ex
  }
}
