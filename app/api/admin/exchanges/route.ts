import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { sql } from "@/lib/db"
import { exchanges } from "@/lib/data/exchanges"
import {
  ensureExchangeOverridesTable,
  ensureCustomExchangesTable,
  type ExchangeOverrideRow,
  type CustomExchangeRow,
} from "@/lib/data/exchange-content"

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get("admin_auth")
}

const SLUGS = new Set(exchanges.map((e) => e.slug))

function revalidateAll() {
  for (const p of ["/", "/bonuses", "/compare"]) revalidatePath(p)
}

async function upsertAffiliateLink(slug: string, name: string, url: string) {
  const clean = url.trim()
  if (!clean) return
  await sql`
    INSERT INTO affiliate_links (slug, name, affiliate_url, updated_at)
    VALUES (${slug}, ${name}, ${clean}, NOW())
    ON CONFLICT (slug) DO UPDATE SET affiliate_url = EXCLUDED.affiliate_url, updated_at = NOW()
  `.catch(() => {})
}

// GET — static exchanges (with current overrides + defaults) and custom (DB-only) exchanges.
export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await ensureExchangeOverridesTable()
  await ensureCustomExchangesTable()
  const ovs = (await sql`SELECT * FROM exchange_overrides`) as unknown as ExchangeOverrideRow[]
  const customs = (await sql`SELECT * FROM custom_exchanges ORDER BY created_at DESC`) as unknown as CustomExchangeRow[]
  const links = (await sql`SELECT slug, affiliate_url FROM affiliate_links`.catch(() => [])) as unknown as Array<{
    slug: string
    affiliate_url: string
  }>
  const ovMap = new Map(ovs.map((r) => [r.slug, r]))
  const urlMap = new Map(links.map((r) => [r.slug, r.affiliate_url]))

  const items = exchanges
    .filter((e) => !e.defunct)
    .map((e) => {
      const o = ovMap.get(e.slug)
      return {
        slug: e.slug,
        name: e.name,
        affiliateUrl: urlMap.get(e.slug) ?? "",
        defaultReferralLink: e.referralLink,
        fields: {
          bonus: { value: o?.bonus ?? "", def: e.bonus },
          bonusDetails: { value: o?.bonus_details ?? "", def: e.bonusDetails },
          rating: { value: o?.rating ?? "", def: e.rating },
          leverage: { value: o?.leverage ?? "", def: e.leverage ?? "" },
          tradingPairs: { value: o?.trading_pairs ?? "", def: e.tradingPairs },
          makerFee: { value: o?.maker_fee ?? "", def: e.fees.maker },
          kyc: { value: o?.kyc ?? null, def: e.kyc },
        },
      }
    })

  const custom = customs.map((c) => ({
    slug: c.slug,
    name: c.name,
    logo: c.logo ?? "",
    rating: c.rating ?? "",
    makerFee: c.maker_fee ?? "",
    takerFee: c.taker_fee ?? "",
    kyc: Boolean(c.kyc),
    bonus: c.bonus ?? "",
    bonusAmount: c.bonus_amount ?? "",
    bonusDetails: c.bonus_details ?? "",
    referralLink: urlMap.get(c.slug) ?? c.referral_link ?? "",
    founded: c.founded ?? "",
    headquarters: c.headquarters ?? "",
    tradingPairs: c.trading_pairs ?? "",
    leverage: c.leverage ?? "",
    pros: (() => {
      try {
        const v = JSON.parse(c.pros ?? "[]")
        return Array.isArray(v) ? v.join("\n") : ""
      } catch {
        return c.pros ?? ""
      }
    })(),
    reviewUrl: c.review_url ?? "",
    copyTrading: Boolean(c.copy_trading),
  }))

  return NextResponse.json({ items, custom })
}

const str = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : ""
  return s === "" ? null : s
}
const int = (v: unknown) => {
  if (v === "" || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}
const num = (v: unknown) => {
  if (v === "" || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// PUT — save one STATIC exchange's overrides (+ affiliate URL). Empty field = revert to code default.
export async function PUT(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { slug, fields, affiliateUrl } = await request.json()
  if (!SLUGS.has(slug)) return NextResponse.json({ error: `Unknown exchange "${slug}"` }, { status: 400 })

  await ensureExchangeOverridesTable()
  const f = fields ?? {}
  const kyc = f.kyc === true || f.kyc === false ? f.kyc : null
  await sql`
    INSERT INTO exchange_overrides (slug, bonus, bonus_details, rating, leverage, trading_pairs, maker_fee, kyc, updated_at)
    VALUES (${slug}, ${str(f.bonus)}, ${str(f.bonusDetails)}, ${num(f.rating)}, ${str(f.leverage)}, ${int(f.tradingPairs)}, ${str(f.makerFee)}, ${kyc}, NOW())
    ON CONFLICT (slug) DO UPDATE SET
      bonus = EXCLUDED.bonus, bonus_details = EXCLUDED.bonus_details, rating = EXCLUDED.rating,
      leverage = EXCLUDED.leverage, trading_pairs = EXCLUDED.trading_pairs, maker_fee = EXCLUDED.maker_fee,
      kyc = EXCLUDED.kyc, updated_at = NOW()
  `
  if (typeof affiliateUrl === "string") {
    const name = exchanges.find((e) => e.slug === slug)?.name ?? slug
    await upsertAffiliateLink(slug, name, affiliateUrl)
  }
  revalidateAll()
  return NextResponse.json({ ok: true, slug })
}

// POST — create or update a CUSTOM (DB-only) exchange, which renders as its own bonus box + comparison row.
export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await request.json()

  const name = str(b.name)
  const slug =
    str(b.slug) ?? (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null)
  if (!name || !slug) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (SLUGS.has(slug)) {
    return NextResponse.json(
      { error: `"${slug}" is a built-in exchange — edit it in the list above instead of adding it.` },
      { status: 400 },
    )
  }
  const referralLink = str(b.referralLink)
  if (!referralLink) return NextResponse.json({ error: "Affiliate / referral link is required" }, { status: 400 })

  const prosArr: string[] = Array.isArray(b.pros)
    ? b.pros
    : typeof b.pros === "string"
      ? b.pros.split("\n").map((s: string) => s.trim()).filter(Boolean)
      : []
  const prosJson = JSON.stringify(prosArr)
  const kyc = b.kyc === true || b.kyc === false ? b.kyc : false
  const copyTrading = b.copyTrading === true

  await ensureCustomExchangesTable()
  await sql`
    INSERT INTO custom_exchanges (
      slug, name, logo, rating, maker_fee, taker_fee, kyc, bonus, bonus_amount, bonus_details,
      referral_link, founded, headquarters, trading_pairs, leverage, pros, review_url, copy_trading, updated_at
    ) VALUES (
      ${slug}, ${name}, ${str(b.logo)}, ${num(b.rating)}, ${str(b.makerFee)}, ${str(b.takerFee)}, ${kyc},
      ${str(b.bonus)}, ${num(b.bonusAmount)}, ${str(b.bonusDetails)}, ${referralLink}, ${str(b.founded)},
      ${str(b.headquarters)}, ${int(b.tradingPairs)}, ${str(b.leverage)}, ${prosJson}, ${str(b.reviewUrl)}, ${copyTrading}, NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, logo = EXCLUDED.logo, rating = EXCLUDED.rating, maker_fee = EXCLUDED.maker_fee,
      taker_fee = EXCLUDED.taker_fee, kyc = EXCLUDED.kyc, bonus = EXCLUDED.bonus, bonus_amount = EXCLUDED.bonus_amount,
      bonus_details = EXCLUDED.bonus_details, referral_link = EXCLUDED.referral_link, founded = EXCLUDED.founded,
      headquarters = EXCLUDED.headquarters, trading_pairs = EXCLUDED.trading_pairs, leverage = EXCLUDED.leverage,
      pros = EXCLUDED.pros, review_url = EXCLUDED.review_url, copy_trading = EXCLUDED.copy_trading, updated_at = NOW()
  `
  await upsertAffiliateLink(slug, name, referralLink)
  revalidateAll()
  return NextResponse.json({ ok: true, slug })
}

// DELETE — remove a custom exchange (?slug=...).
export async function DELETE(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const slug = new URL(request.url).searchParams.get("slug")
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })
  await ensureCustomExchangesTable()
  await sql`DELETE FROM custom_exchanges WHERE slug = ${slug}`
  revalidateAll()
  return NextResponse.json({ ok: true, slug })
}
