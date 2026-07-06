/**
 * Merge layer for editable exchange content. The canonical data still lives in
 * lib/data/exchanges.ts (the code defaults); this overlays admin-managed sources
 * so the customer-facing bonus surfaces can be edited — and net-new exchanges
 * added — without a deploy:
 *   • referral link   ← `affiliate_links.affiliate_url`  (managed at /admin/affiliate-links)
 *   • bonus + stats   ← `exchange_overrides`             (managed at /admin/exchanges)
 *   • custom exchanges← `custom_exchanges`               (added at /admin/exchanges)
 *
 * Reads are resilient: any DB error falls back to the static list, so pages
 * never break if the tables are missing.
 */
import { sql } from "@/lib/db"
import { exchanges as staticExchanges, getExchangeBySlug as staticBySlug } from "@/lib/data/exchanges"
import type { Exchange } from "@/lib/data/types"

// Columns editable in /admin/exchanges for a STATIC exchange (null = use code default).
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

// Full record for a DB-only (admin-added) exchange.
export interface CustomExchangeRow {
  slug: string
  name: string
  logo: string | null
  rating: number | string | null
  maker_fee: string | null
  taker_fee: string | null
  kyc: boolean | null
  bonus: string | null
  bonus_amount: number | string | null
  bonus_details: string | null
  referral_link: string | null
  founded: string | null
  headquarters: string | null
  trading_pairs: number | null
  leverage: string | null
  pros: string | null // JSON array of strings
  review_url: string | null
  copy_trading: boolean | null
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

export async function ensureCustomExchangesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS custom_exchanges (
      slug          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      logo          TEXT,
      rating        NUMERIC,
      maker_fee     TEXT,
      taker_fee     TEXT,
      kyc           BOOLEAN,
      bonus         TEXT,
      bonus_amount  NUMERIC,
      bonus_details TEXT,
      referral_link TEXT,
      founded       TEXT,
      headquarters  TEXT,
      trading_pairs INTEGER,
      leverage      TEXT,
      pros          TEXT,
      review_url    TEXT,
      copy_trading  BOOLEAN,
      created_at    TIMESTAMP DEFAULT NOW(),
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

function parsePros(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map((s) => String(s)).filter(Boolean) : []
  } catch {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean)
  }
}

// Build a full Exchange from a custom row, defaulting fields the card/table don't need.
export function buildCustomExchange(r: CustomExchangeRow, url: string | undefined): Exchange {
  return {
    slug: r.slug,
    name: r.name,
    logo: r.logo ?? undefined,
    rating: r.rating != null && r.rating !== "" ? Number(r.rating) : 0,
    fees: { maker: r.maker_fee ?? "—", taker: r.taker_fee ?? "—" },
    kyc: Boolean(r.kyc),
    bonus: r.bonus ?? "",
    bonusAmount: r.bonus_amount != null && r.bonus_amount !== "" ? Number(r.bonus_amount) : 0,
    bonusDetails: r.bonus_details ?? "",
    referralLink: url || r.referral_link || "#",
    founded: r.founded ?? "—",
    headquarters: r.headquarters ?? "—",
    tradingPairs: r.trading_pairs ?? 0,
    leverage: r.leverage ?? undefined,
    minDeposit: "—",
    withdrawalSpeed: "—",
    securityFeatures: [],
    pros: parsePros(r.pros),
    cons: [],
    summary: "",
    fullReview: r.review_url ?? "",
    category: "Exchange",
    copyTrading: Boolean(r.copy_trading),
    debitCard: false,
    fiatDeposit: false,
    depositMethods: [],
    countries: { US: false, UK: false, AU: false, CA: false, EU: false, ASIA: false },
  }
}

async function loadSources() {
  await ensureExchangeOverridesTable()
  await ensureCustomExchangesTable()
  const ovs = (await sql`SELECT * FROM exchange_overrides`) as unknown as ExchangeOverrideRow[]
  const customs = (await sql`SELECT * FROM custom_exchanges ORDER BY created_at DESC`) as unknown as CustomExchangeRow[]
  let links: Array<{ slug: string; affiliate_url: string }> = []
  try {
    links = (await sql`SELECT slug, affiliate_url FROM affiliate_links WHERE affiliate_url IS NOT NULL AND affiliate_url <> ''`) as unknown as Array<{ slug: string; affiliate_url: string }>
  } catch {
    links = [] // affiliate_links table may not exist yet
  }
  return {
    ovMap: new Map(ovs.map((r) => [r.slug, r] as const)),
    customs,
    urlMap: new Map(links.map((r) => [r.slug, r.affiliate_url] as const)),
  }
}

/** All exchanges (static + custom, incl. defunct — consumers filter) with admin overrides applied. */
export async function getMergedExchanges(): Promise<Exchange[]> {
  try {
    const { ovMap, customs, urlMap } = await loadSources()
    const staticSlugs = new Set(staticExchanges.map((e) => e.slug))
    const staticMerged = staticExchanges.map((ex) => applyOverride(ex, ovMap.get(ex.slug), urlMap.get(ex.slug)))
    // Custom rows that don't shadow a static slug become their own cards.
    const customMerged = customs
      .filter((c) => !staticSlugs.has(c.slug))
      .map((c) => buildCustomExchange(c, urlMap.get(c.slug)))
    return [...staticMerged, ...customMerged]
  } catch {
    return staticExchanges
  }
}

export async function getMergedExchangeBySlug(slug: string): Promise<Exchange | undefined> {
  try {
    const { ovMap, customs, urlMap } = await loadSources()
    const ex = staticBySlug(slug)
    if (ex) return applyOverride(ex, ovMap.get(slug), urlMap.get(slug))
    const c = customs.find((r) => r.slug === slug)
    return c ? buildCustomExchange(c, urlMap.get(slug)) : undefined
  } catch {
    return staticBySlug(slug)
  }
}
