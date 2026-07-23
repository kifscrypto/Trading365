import { INDEXED_LOCALES, isIndexedLocale } from "./config"

const BASE_URL = "https://trading365.org"

/**
 * Build the hreflang `alternates.languages` map for an article, shared by the
 * English page and every localized page so all versions advertise the same set.
 *
 * - `x-default` and `en` both point at the English (canonical-category) URL.
 * - Each indexed locale that actually has a translation of THIS slug is added.
 *
 * We never advertise a locale that (a) isn't in INDEXED_LOCALES or (b) has no
 * translation for this slug — an hreflang alternate must resolve to a real,
 * indexable page.
 */
export function buildArticleLanguages(
  slug: string,
  canonicalCategory: string,
  translatedLocales: string[]
): Record<string, string> {
  const enUrl = `${BASE_URL}/${canonicalCategory}/${slug}`
  const languages: Record<string, string> = {
    "x-default": enUrl,
    en: enUrl,
  }
  for (const lc of translatedLocales) {
    if (isIndexedLocale(lc)) {
      languages[lc] = `${BASE_URL}/${lc}/${canonicalCategory}/${slug}`
    }
  }
  return languages
}

/**
 * hreflang map for the homepage / top-level landing pages. English is the
 * default; each indexed locale gets its /{locale} landing page.
 */
export function buildHomeLanguages(): Record<string, string> {
  const languages: Record<string, string> = {
    "x-default": BASE_URL,
    en: BASE_URL,
  }
  for (const lc of INDEXED_LOCALES) {
    languages[lc] = `${BASE_URL}/${lc}`
  }
  return languages
}
