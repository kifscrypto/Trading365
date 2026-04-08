/**
 * Database-backed article helpers.
 * Converts snake_case DB rows to the camelCase Article shape used by the UI.
 * Falls back to static articles.ts data when DB is unavailable.
 */
import { getAllArticles, getPublishedArticles, getArticleBySlug as dbGetBySlug, getArticlesByCategory, getPublishedArticlesByCategory } from '@/lib/db'
import { articles as staticArticles } from '@/lib/data/articles'
import type { Article } from '@/lib/data/types'
import type { ArticleRow } from '@/lib/db'

export function rowToArticle(row: ArticleRow): Article {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    category: row.category,
    categorySlug: row.category_slug,
    date: row.date,
    updatedDate: row.updated_date ?? undefined,
    readTime: row.read_time,
    author: row.author,
    rating: Number(row.rating),
    thumbnail: row.thumbnail,
    tags: row.tags ?? [],
    faqs: row.faqs ?? [],
    metaTitle: row.meta_title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    metaKeywords: row.meta_keywords ?? undefined,
  }
}

export async function getAllArticlesFromDB(): Promise<Article[]> {
  try {
    const rows = await getPublishedArticles()
    if (rows.length > 0) return rows.map(rowToArticle)
  } catch {
    // published column may not exist yet — try without filter
    try {
      const rows = await getAllArticles()
      if (rows.length > 0) return rows.map(rowToArticle)
    } catch {
      // DB unavailable
    }
  }
  return staticArticles
}

export async function getArticleBySlugFromDB(slug: string): Promise<Article | null> {
  try {
    const row = await dbGetBySlug(slug)
    if (row) return rowToArticle(row)
  } catch {
    // published column may not exist yet — try without filter
    try {
      const { sql } = await import('@/lib/db')
      const rows = await sql`SELECT * FROM articles WHERE slug = ${slug} LIMIT 1`
      if (rows[0]) return rowToArticle(rows[0] as ArticleRow)
    } catch {
      // DB unavailable
    }
  }
  return staticArticles.find((a) => a.slug === slug) ?? null
}

export async function getArticlesByCategoryFromDB(categorySlug: string): Promise<Article[]> {
  try {
    const rows = await getPublishedArticlesByCategory(categorySlug)
    if (rows.length > 0) return rows.map(rowToArticle)
  } catch {
    // published column may not exist yet — try without filter
    try {
      const rows = await getArticlesByCategory(categorySlug)
      if (rows.length > 0) return rows.map(rowToArticle)
    } catch {
      // DB unavailable
    }
  }
  return staticArticles.filter((a) => a.categorySlug === categorySlug)
}
