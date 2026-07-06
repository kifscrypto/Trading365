/**
 * Editable "featured slots" — ordered slug lists the admin can curate at
 * /admin/featured, so the homepage deals, homepage featured articles, and the
 * bonuses-page top picks are no longer hardcoded in the page source.
 *
 * Each slot is one row in `featured_slots` holding an ordered text[] of slugs.
 * Reads are resilient: any DB error (or an empty/unset slot) falls back to the
 * baked-in defaults below, so the pages can never break if the table is missing
 * or a slot hasn't been configured yet.
 */
import { sql } from "@/lib/db"

export type FeaturedSlot = "homepage_deals" | "featured_articles" | "bonus_pins"

export const FEATURED_SLOTS: { slot: FeaturedSlot; label: string; kind: "exchange" | "article"; help: string }[] = [
  { slot: "homepage_deals", label: "Homepage — Top Sign-Up Bonuses", kind: "exchange", help: "The 3 exchange cards under \"Exclusive Deals\" on the homepage." },
  { slot: "bonus_pins", label: "Bonuses Page — Pinned Top Deals", kind: "exchange", help: "Which exchanges lead the /bonuses grid (first is tagged \"Best Deal\"). Others follow after." },
  { slot: "featured_articles", label: "Homepage — Featured Reviews & Guides", kind: "article", help: "Up to 6 articles in the \"Featured Reviews & Guides\" grid. Empty = latest 6 automatically." },
]

// Baked-in fallbacks — mirror the values the pages used before this was editable.
export const FEATURED_DEFAULTS: Record<FeaturedSlot, string[]> = {
  homepage_deals: ["weex", "bybit", "bitunix"],
  bonus_pins: ["weex", "bydfi", "bitunix"],
  featured_articles: [], // empty → page falls back to latest N
}

export async function ensureFeaturedTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS featured_slots (
      slot       TEXT PRIMARY KEY,
      items      TEXT[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
}

/** Ordered slugs for a slot, or the baked-in default if unset/empty/unavailable. */
export async function getFeaturedSlot(slot: FeaturedSlot): Promise<string[]> {
  try {
    await ensureFeaturedTable()
    const rows = (await sql`SELECT items FROM featured_slots WHERE slot = ${slot} LIMIT 1`) as Array<{ items: string[] }>
    const items = rows[0]?.items
    if (Array.isArray(items) && items.length > 0) return items
  } catch {
    // table missing / DB unavailable → fall through to default
  }
  return FEATURED_DEFAULTS[slot]
}

/** All configured slots as a map (missing slots omitted). Admin/read use. */
export async function getAllFeaturedSlots(): Promise<Record<string, string[]>> {
  try {
    await ensureFeaturedTable()
    const rows = (await sql`SELECT slot, items FROM featured_slots`) as Array<{ slot: string; items: string[] }>
    const map: Record<string, string[]> = {}
    for (const r of rows) map[r.slot] = Array.isArray(r.items) ? r.items : []
    return map
  } catch {
    return {}
  }
}

export async function setFeaturedSlot(slot: FeaturedSlot, items: string[]): Promise<void> {
  await ensureFeaturedTable()
  const clean = items.map((s) => String(s).trim()).filter(Boolean)
  await sql`
    INSERT INTO featured_slots (slot, items, updated_at)
    VALUES (${slot}, ${clean}::text[], NOW())
    ON CONFLICT (slot) DO UPDATE SET items = ${clean}::text[], updated_at = NOW()
  `
}
