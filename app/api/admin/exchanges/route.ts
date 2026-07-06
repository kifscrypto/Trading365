import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { sql } from "@/lib/db"
import { exchanges } from "@/lib/data/exchanges"
import { ensureExchangeOverridesTable, type ExchangeOverrideRow } from "@/lib/data/exchange-content"

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get("admin_auth")
}

const SLUGS = new Set(exchanges.map((e) => e.slug))

// GET — every non-defunct exchange with its current override (editable) + code default (placeholder).
export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await ensureExchangeOverridesTable()
  const ovs = (await sql`SELECT * FROM exchange_overrides`) as ExchangeOverrideRow[]
  const links = (await sql`SELECT slug, affiliate_url FROM affiliate_links`.catch(() => [])) as Array<{
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
          kyc: { value: o?.kyc ?? null, def: e.kyc }, // null = use default
        },
      }
    })
  return NextResponse.json(items)
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

// PUT — save one exchange's overrides (+ affiliate URL). Empty field = revert to code default.
export async function PUT(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const { slug, fields, affiliateUrl } = body
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

  // Affiliate URL lives in the shared affiliate_links table (source of truth for links).
  if (typeof affiliateUrl === "string") {
    const name = exchanges.find((e) => e.slug === slug)?.name ?? slug
    const url = affiliateUrl.trim()
    if (url) {
      await sql`
        INSERT INTO affiliate_links (slug, name, affiliate_url, updated_at)
        VALUES (${slug}, ${name}, ${url}, NOW())
        ON CONFLICT (slug) DO UPDATE SET affiliate_url = EXCLUDED.affiliate_url, updated_at = NOW()
      `.catch(() => {})
    }
  }

  for (const p of ["/", "/bonuses", "/compare"]) revalidatePath(p)
  return NextResponse.json({ ok: true, slug })
}
