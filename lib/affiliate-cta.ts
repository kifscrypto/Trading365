import { sql } from '@/lib/db'

// Resolves a "Visit {exchange}" affiliate CTA for review articles whose exchange
// isn't in the static exchanges.ts list, by falling back to the admin-managed
// `affiliate_links` table. Keeps single-exchange reviews converting without
// fabricating Quick Facts data we don't have for these exchanges.

export type AffiliateCta = { name: string; url: string }

// Articles that are roundups, regional/restriction explainers, or negative
// verdicts — a single-exchange "Visit X" CTA would mislead the reader, so we
// never attach one to these even if a matching link exists.
const NO_CTA_RE = /(^|-)(best|top)-|to-avoid|should-avoid|by-country|no-longer-safe|not-safe|deadline|mica|sign-?up-bonuses|restricted-countries|tokens-worth|which-crypto-exchanges|banned-in/i

type LinkRow = { slug: string; name: string; affiliate_url: string }

// Small in-process cache — affiliate links change rarely and review pages are
// ISR-cached anyway, so this just avoids a DB round-trip on render bursts.
let cache: { at: number; rows: LinkRow[] } | null = null
const TTL_MS = 60_000

async function getLinks(): Promise<LinkRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  try {
    const rows = (await sql`
      SELECT slug, name, affiliate_url FROM affiliate_links
      WHERE affiliate_url IS NOT NULL AND affiliate_url <> ''
    `) as LinkRow[]
    cache = { at: Date.now(), rows }
    return rows
  } catch {
    // Table may not exist yet (never seeded) — degrade to no CTA.
    return cache?.rows ?? []
  }
}

/**
 * Given an article slug (only meaningful for reviews), return the affiliate CTA
 * to use, or null when the article is a roundup/negative piece or no link matches.
 */
export async function resolveAffiliateCta(articleSlug: string): Promise<AffiliateCta | null> {
  if (NO_CTA_RE.test(articleSlug)) return null

  const rows = await getLinks()
  if (rows.length === 0) return null

  const exSlug = articleSlug.replace(/-review.*$/, '')

  // 1. Exact match on the de-suffixed slug (binance-review-2026 → "binance").
  let hit = rows.find(r => r.slug === exSlug)

  // 2. Hyphen-token match for slugs where the exchange isn't the whole prefix
  //    (kcex-exchange-review…, gold-trading-weex-2026). Restricted to slugs of
  //    length ≥ 4 so short tickers (xt/okx/htx) can't false-match a stray token;
  //    those always resolve via the exact match above when they're the subject.
  if (!hit) {
    const tokens = new Set(articleSlug.split('-'))
    hit = rows
      .filter(r => r.slug.length >= 4 && tokens.has(r.slug))
      .sort((a, b) => b.slug.length - a.slug.length)[0]
  }

  return hit ? { name: hit.name, url: hit.affiliate_url } : null
}
