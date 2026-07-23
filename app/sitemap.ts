import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { getTranslationLocalesBySlug } from "@/lib/db"
import { categories } from "@/lib/data/categories"
import { INDEXED_LOCALES } from "@/lib/i18n/config"
import { buildArticleLanguages, buildHomeLanguages } from "@/lib/i18n/hreflang"
import type { MetadataRoute } from "next"

const BASE_URL = "https://trading365.org"

// Parse article date strings like "Sep 15, 2025" or "Feb 2026" to ISO
function parseArticleDate(dateStr: string): string {
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()
  // Fallback: month-year like "Feb 2026"
  const monthYear = new Date(`1 ${dateStr}`)
  if (!isNaN(monthYear.getTime())) return monthYear.toISOString()
  return new Date().toISOString()
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // English pages, plus localized article + landing URLs for INDEXED_LOCALES
  // (fully-translated locales). Non-indexed locales are still excluded. Each
  // entry carries hreflang alternates so search engines cluster the versions.
  const articles = await getAllArticlesFromDB()
  const localesBySlug = await getTranslationLocalesBySlug().catch(() => ({} as Record<string, string[]>))
  const now = new Date().toISOString()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0, alternates: { languages: buildHomeLanguages() } },
    // Localized landing pages for launched locales.
    ...INDEXED_LOCALES.map((lc) => ({
      url: `${BASE_URL}/${lc}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
      alternates: { languages: buildHomeLanguages() },
    })),
    { url: `${BASE_URL}/scanner`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/scanner/longs`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/bonuses`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    // /join-our-newsletter is intentionally noindex (thin lead-capture) — omitted.
    { url: `${BASE_URL}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ]

  // Category pages — exclude "bonuses" as it has its own dedicated static page above
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.slug !== "bonuses")
    .map((cat) => ({
      url: `${BASE_URL}/${cat.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))

  // Article pages — English entry plus one entry per indexed locale that has a
  // translation of that slug. Every version shares the same hreflang alternates.
  const articlePages: MetadataRoute.Sitemap = articles.flatMap((article) => {
    const dateStr = article.updatedDate || article.date
    const lastModified = parseArticleDate(dateStr)
    const translatedLocales = localesBySlug[article.slug] ?? []
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
          lastModified,
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
