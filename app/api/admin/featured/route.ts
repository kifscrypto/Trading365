import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  FEATURED_SLOTS,
  FEATURED_DEFAULTS,
  getAllFeaturedSlots,
  setFeaturedSlot,
  type FeaturedSlot,
} from "@/lib/data/featured"
import { exchanges } from "@/lib/data/exchanges"
import { getAllArticlesFromDB } from "@/lib/data/articles-db"

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get("admin_auth")
}

const VALID_SLOTS = new Set(FEATURED_SLOTS.map((s) => s.slot))

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const configured = await getAllFeaturedSlots()
  // Current value per slot = configured (if any) else the baked-in default.
  const slots: Record<string, string[]> = {}
  for (const { slot } of FEATURED_SLOTS) {
    const c = configured[slot]
    slots[slot] = Array.isArray(c) && c.length > 0 ? c : FEATURED_DEFAULTS[slot]
  }

  const articles = await getAllArticlesFromDB()
  return NextResponse.json({
    meta: FEATURED_SLOTS,
    slots,
    options: {
      exchange: exchanges
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
  return NextResponse.json({ ok: true, slot, items })
}
