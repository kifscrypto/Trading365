import { sql } from "@/lib/db"

/**
 * The three above-the-fold "Top Picks" cards.
 *
 * WHY THIS FILE EXISTS: these three slots are placement deals and rotate. Keeping
 * them as one commented array means swapping a partner is a one-line edit here,
 * not a hunt through JSX.
 *
 * ⚠️ AFFILIATE URLS ARE NOT STORED HERE ON PURPOSE. They are resolved at render
 * time from the `affiliate_links` table (managed at /admin/affiliate-links),
 * which is the single source of truth the rest of the site already uses — the
 * static lib/data/exchanges.ts copies are stale and overridden by it. Hardcoding
 * a URL here would mean a link change in admin silently stopped applying to the
 * highest-traffic placement on the site.
 *
 * Ratings are out of 10, matching every other rating surface on the site.
 */
export interface TopPickSlot {
  /** Badge label, e.g. BEST OVERALL. */
  label: string
  /** Must match a slug in `affiliate_links`. */
  slug: string
  name: string
  /** Out of 10. */
  rating: number
  oneLiner: string
  bonusLine: string
  /** Internal review page — dofollow, stays internal. */
  reviewHref: string
}

export const TOP_PICK_SLOTS: readonly TopPickSlot[] = [
  {
    label: "BEST OVERALL",
    slug: "bybit",
    name: "Bybit",
    rating: 8.8, // matches lib/data/exchanges.ts
    oneLiner: "Deep liquidity, world-class derivatives platform",
    bonusLine: "Up to 30,000 USDT in rewards",
    reviewHref: "/reviews/bybit-review",
  },
  {
    label: "BEST NO-KYC",
    slug: "bydfi",
    name: "BYDFi",
    rating: 9.0, // matches lib/data/exchanges.ts
    oneLiner: "High leverage, no ID required",
    bonusLine: "Up to 8,100 USDT bonus",
    reviewHref: "/no-kyc/bydfi-review",
  },
  {
    label: "BEST BONUS",
    slug: "bitbase",
    name: "Bitbase",
    rating: 8.8, // supplied by the site owner; Bitbase has no stored rating row
    oneLiner: "Biggest new-user package right now",
    bonusLine: "Up to 33,500 USDT sign-up bonus",
    reviewHref: "/reviews/bitbase-exchange",
  },
]

export interface ResolvedTopPick extends TopPickSlot {
  /** null when the slug has no row in affiliate_links — card renders without a Visit button. */
  affiliateUrl: string | null
}

/**
 * Hydrates the slots with their live affiliate URLs.
 *
 * Fails soft: a database hiccup returns the slots with null URLs rather than
 * throwing, because the homepage must still render. A card with no URL drops its
 * Visit button instead of emitting a dead or wrong link.
 */
export async function getTopPicks(): Promise<ResolvedTopPick[]> {
  let links = new Map<string, string>()
  try {
    const slugs = TOP_PICK_SLOTS.map((s) => s.slug)
    const rows = (await sql`
      SELECT slug, affiliate_url FROM affiliate_links
      WHERE slug = ANY(${slugs}) AND affiliate_url IS NOT NULL AND affiliate_url <> ''
    `) as unknown as Array<{ slug: string; affiliate_url: string }>
    links = new Map(rows.map((r) => [r.slug, r.affiliate_url]))
  } catch {
    // table missing or unreachable — render without Visit buttons
  }
  return TOP_PICK_SLOTS.map((s) => ({ ...s, affiliateUrl: links.get(s.slug) ?? null }))
}
