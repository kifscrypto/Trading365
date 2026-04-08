import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { getTranslationLocalesBySlug } from "@/lib/db"
import { categories } from "@/lib/data/categories"
import { LOCALES } from "@/lib/i18n/config"
import type { MetadataRoute } from "next"

const BASE_URL = "https://www.trading365.org"

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
  const [articles, translationMap] = await Promise.all([
    getAllArticlesFromDB(),
    getTranslationLocalesBySlug().catch(() => ({} as Record<string, string[]>)),
  ])
  const now = new Date().toISOString()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/bonuses`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/join-our-newsletter`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
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

  // Article pages — use actual article date (or updatedDate if present)
  const articlePages: MetadataRoute.Sitemap = articles.map((article) => {
    const dateStr = article.updatedDate || article.date
    return {
      url: `${BASE_URL}/${article.categorySlug}/${article.slug}`,
      lastModified: parseArticleDate(dateStr),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }
  })

  // Language landing pages (/es, /pt, /de, etc.)
  const localePages: MetadataRoute.Sitemap = LOCALES.map((loc) => ({
    url: `${BASE_URL}/${loc.code}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }))

  // Localised article pages — only include articles that are actually translated
  const localeArticlePages: MetadataRoute.Sitemap = LOCALES.flatMap((loc) =>
    articles
      .filter((article) => translationMap[article.slug]?.includes(loc.code))
      .map((article) => ({
        url: `${BASE_URL}/${loc.code}/${article.categorySlug}/${article.slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }))
  )

  return [...staticPages, ...categoryPages, ...articlePages, ...localePages, ...localeArticlePages]
}
