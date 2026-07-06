import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import {
  FEATURED_SLOTS,
  FEATURED_DEFAULTS,
  getAllFeaturedSlots,
  setFeaturedSlot,
  type FeaturedSlot,
} from "@/lib/data/featured"
import { getMergedExchanges } from "@/lib/data/exchange-content"
import { getAllArticlesFromDB } from "@/lib/data/articles-db"

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get("admin_auth")
}

const VALID_SLOTS = new Set(FEATURED_SLOTS.map((s) => s.slot))

// Which cached pages to refresh immediately when a slot is saved.
const AFFECTED_PATHS: Record<string, string[]> = {
  homepage_deals: ["/"],
  featured_articles: ["/"],
  bonus_pins: ["/bonuses"],
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const configured = await getAllFeaturedSlots()
  // Current value per slot = configured (if any) else the baked-in default.
  const slots: Record<string, string[]> = {}
  for (const { slot } of FEATURED_SLOTS) {
    const c = configured[slot]
    slots[slot] = Array.isArray(c) && c.length > 0 ? c : FEATURED_DEFAULTS[slot]
  }

  const [articles, allExchanges] = await Promise.all([getAllArticlesFromDB(), getMergedExchanges()])
  return NextResponse.json({
    meta: FEATURED_SLOTS,
    slots,
    options: {
      // Includes custom (DB-only) exchanges added via /admin/exchanges, not just built-ins.
      exchange: allExchanges
        .filter((e) => !e.defunct)
        .map((e) => ({ slug: e.slug, name: e.name, href: e.fullReview })),
      article: articles.map((a) => ({
        slug: a.slug,
        name: a.title,
        category: a.category,
        href: `/${a.categorySlug}/${a.slug}`,
      })),
    },
  })
}

export async function PUT(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { slot, items } = await request.json()
  if (!VALID_SLOTS.has(slot)) {
    return NextResponse.json({ error: `Unknown slot "${slot}"` }, { status: 400 })
  }
  if (!Array.isArray(items) || items.some((s) => typeof s !== "string")) {
    return NextResponse.json({ error: "items must be an array of slug strings" }, { status: 400 })
  }
  await setFeaturedSlot(slot as FeaturedSlot, items)
  // Refresh the cached page(s) so the change shows immediately, not after ISR lapses.
  for (const path of AFFECTED_PATHS[slot] ?? []) revalidatePath(path)
  return NextResponse.json({ ok: true, slot, items })
}
