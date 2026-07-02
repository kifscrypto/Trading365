import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { categories } from "@/lib/data/categories"
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
  // English-only sitemap. Locale routes (/es, /pt, …) are noindex, so they are
  // intentionally excluded here along with any hreflang alternates to them.
  const articles = await getAllArticlesFromDB()
  const now = new Date().toISOString()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
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

  return [...staticPages, ...categoryPages, ...articlePages]
}
