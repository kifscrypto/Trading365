import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { getTranslationDatesBySlug } from "@/lib/db"
import { categories } from "@/lib/data/categories"
import { INDEXED_LOCALES } from "@/lib/i18n/config"
import { buildArticleLanguages, buildHomeLanguages } from "@/lib/i18n/hreflang"
import type { MetadataRoute } from "next"

const BASE_URL = "https://trading365.org"

// Fixed lastmod for static pages — the last meaningful site-wide content change
// (the 2026-07-24 localized-page repair). A per-request new Date() is ignored
// by Google; bump this when static page content actually changes.
const STATIC_LAST_MODIFIED = "2026-07-24T00:00:00.000Z"

// Parse article date strings like "Sep 15, 2025" or "Feb 2026" to ISO
function parseArticleDate(dateStr: string): string {
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()
  // Fallback: month-year like "Feb 2026"
  const monthYear = new Date(`1 ${dateStr}`)
  if (!isNaN(monthYear.getTime())) return monthYear.toISOString()
  return STATIC_LAST_MODIFIED
}

// Parse a DB timestamp (translations.translated_at) to ISO; null if unusable
function parseDbTimestamp(ts: string | undefined): string | null {
  if (!ts) return null
  const parsed = new Date(ts)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // English pages, plus localized article + landing URLs for INDEXED_LOCALES
  // (fully-translated locales). Non-indexed locales are still excluded. Each
  // entry carries hreflang alternates so search engines cluster the versions.
  const articles = await getAllArticlesFromDB()
  const translationsBySlug = await getTranslationDatesBySlug().catch(() => ({} as Record<string, Record<string, string>>))

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "daily", priority: 1.0, alternates: { languages: buildHomeLanguages() } },
    // Localized landing pages for launched locales.
    ...INDEXED_LOCALES.map((lc) => ({
      url: `${BASE_URL}/${lc}`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "daily" as const,
      priority: 0.7,
      alternates: { languages: buildHomeLanguages() },
    })),
    { url: `${BASE_URL}/scanner`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/scanner/longs`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/compare`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/bonuses`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "weekly", priority: 0.8 },
    // /join-our-newsletter is intentionally noindex (thin lead-capture) — omitted.
    { url: `${BASE_URL}/disclaimer`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
  ]

  // Category pages — exclude "bonuses" as it has its own dedicated static page above
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.slug !== "bonuses")
    .map((cat) => ({
      url: `${BASE_URL}/${cat.slug}`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))

  // Article pages — English entry plus one entry per indexed locale that has a
  // translation of that slug. Every version shares the same hreflang alternates.
  const articlePages: MetadataRoute.Sitemap = articles.flatMap((article) => {
    const dateStr = article.updatedDate || article.date
    const lastModified = parseArticleDate(dateStr)
    const translations = translationsBySlug[article.slug] ?? {}
    const translatedLocales = Object.keys(translations)
    const languages = buildArticleLanguages(article.slug, article.categorySlug, translatedLocales)

    const entries: MetadataRoute.Sitemap = [
      {
        url: `${BASE_URL}/${article.categorySlug}/${article.slug}`,
        lastModified,
        changeFrequency: "monthly" as const,
        priority: 0.7,
        alternates: { languages },
      },
    ]
    for (const lc of translatedLocales) {
      if (INDEXED_LOCALES.includes(lc)) {
        entries.push({
          url: `${BASE_URL}/${lc}/${article.categorySlug}/${article.slug}`,
          // The translation's own translated_at reflects content repairs the
          // EN article date doesn't; fall back to the article date.
          lastModified: parseDbTimestamp(translations[lc]) ?? lastModified,
          changeFrequency: "monthly" as const,
          priority: 0.6,
          alternates: { languages },
        })
      }
    }
    return entries
  })

  return [...staticPages, ...categoryPages, ...articlePages]
}
