import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)

export type ArticleRow = {
  id: number
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  category_slug: string
  date: string
  updated_date: string | null
  read_time: string
  author: string
  rating: number
  thumbnail: string
  tags: string[]
  faqs: { question: string; answer: string }[] | null
  meta_title: string | null
  meta_description: string | null
  meta_keywords: string | null
  created_at: string
  updated_at: string
}

export async function getAllArticles(): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    ORDER BY created_at DESC
  `
}

export async function getArticleBySlug(slug: string): Promise<ArticleRow | null> {
  const rows = await sql`
    SELECT * FROM articles WHERE slug = ${slug} LIMIT 1
  `
  return rows[0] ?? null
}

export async function getArticlesByCategory(categorySlug: string): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    WHERE category_slug = ${categorySlug}
    ORDER BY created_at DESC
  `
}

export async function createArticle(data: Omit<ArticleRow, 'id' | 'created_at' | 'updated_at'>): Promise<ArticleRow> {
  const rows = await sql`
    INSERT INTO articles (
      slug, title, excerpt, content, category, category_slug,
      date, updated_date, read_time, author, rating, thumbnail, tags, faqs,
      meta_title, meta_description, meta_keywords
    ) VALUES (
      ${data.slug}, ${data.title}, ${data.excerpt}, ${data.content},
      ${data.category}, ${data.category_slug}, ${data.date}, ${data.updated_date ?? null},
      ${data.read_time}, ${data.author}, ${data.rating}, ${data.thumbnail},
      ${data.tags}, ${JSON.stringify(data.faqs ?? [])},
      ${data.meta_title ?? null}, ${data.meta_description ?? null}, ${data.meta_keywords ?? null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function updateArticle(id: number, data: Partial<Omit<ArticleRow, 'id' | 'created_at' | 'updated_at'>>): Promise<ArticleRow> {
  const rows = await sql`
    UPDATE articles SET
      slug = COALESCE(${data.slug ?? null}, slug),
      title = COALESCE(${data.title ?? null}, title),
      excerpt = COALESCE(${data.excerpt ?? null}, excerpt),
      content = COALESCE(${data.content ?? null}, content),
      category = COALESCE(${data.category ?? null}, category),
      category_slug = COALESCE(${data.category_slug ?? null}, category_slug),
      date = COALESCE(${data.date ?? null}, date),
      updated_date = ${data.updated_date ?? null},
      read_time = COALESCE(${data.read_time ?? null}, read_time),
      author = COALESCE(${data.author ?? null}, author),
      rating = COALESCE(${data.rating ?? null}, rating),
      thumbnail = COALESCE(${data.thumbnail ?? null}, thumbnail),
      tags = COALESCE(${data.tags ?? null}, tags),
      faqs = COALESCE(${data.faqs ? JSON.stringify(data.faqs) : null}::jsonb, faqs),
      meta_title = COALESCE(${data.meta_title ?? null}, meta_title),
      meta_description = COALESCE(${data.meta_description ?? null}, meta_description),
      meta_keywords = COALESCE(${data.meta_keywords ?? null}, meta_keywords),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0]
}

export async function deleteArticle(id: number): Promise<void> {
  await sql`DELETE FROM articles WHERE id = ${id}`
}
