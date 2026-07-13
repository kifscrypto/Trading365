// Slugs are permanent URLs. A baked-in year ("...-2026") forces a 301 redirect
// and a ranking wobble every January, so slugs must stay evergreen. Titles and
// meta keep the year (good for SERP CTR + freshness); the URL never carries it.
//
// This strips standalone 4-digit year tokens (1900–2099) from a hyphenated slug.
export function stripYearFromSlug(slug: string): string {
  if (!slug) return slug
  return slug
    .split('-')
    .filter(w => !/^(19|20)\d{2}$/.test(w))
    .join('-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}
