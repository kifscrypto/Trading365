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
  pros: string[] | null
  cons: string[] | null
  meta_title: string | null
  meta_description: string | null
  meta_keywords: string | null
  published: boolean
  created_at: string
  updated_at: string
}

export async function getAllArticles(): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    ORDER BY date DESC
  `
}

export async function getPublishedArticles(): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    WHERE published = true
    ORDER BY date DESC
  `
}

export async function getArticleBySlug(slug: string): Promise<ArticleRow | null> {
  const rows = await sql`
    SELECT * FROM articles WHERE slug = ${slug} AND published = true LIMIT 1
  `
  return rows[0] ?? null
}

export async function getArticlesByCategory(categorySlug: string): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    WHERE category_slug = ${categorySlug}
    ORDER BY date DESC
  `
}

export async function getPublishedArticlesByCategory(categorySlug: string): Promise<ArticleRow[]> {
  return await sql`
    SELECT * FROM articles
    WHERE category_slug = ${categorySlug} AND published = true
    ORDER BY date DESC
  `
}

export async function setArticlePublished(id: number, published: boolean): Promise<ArticleRow> {
  const rows = await sql`
    UPDATE articles SET published = ${published}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0]
}

export async function createArticle(data: Omit<ArticleRow, 'id' | 'created_at' | 'updated_at'>): Promise<ArticleRow> {
  const rows = await sql`
    INSERT INTO articles (
      slug, title, excerpt, content, category, category_slug,
      date, updated_date, read_time, author, rating, thumbnail, tags, faqs, pros, cons,
      meta_title, meta_description, meta_keywords
    ) VALUES (
      ${data.slug}, ${data.title}, ${data.excerpt}, ${data.content},
      ${data.category}, ${data.category_slug}, ${data.date}, ${data.updated_date ?? null},
      ${data.read_time}, ${data.author}, ${data.rating}, ${data.thumbnail},
      ${data.tags}, ${JSON.stringify(data.faqs ?? [])},
      ${JSON.stringify(data.pros ?? [])}, ${JSON.stringify(data.cons ?? [])},
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
      pros = COALESCE(${data.pros ? JSON.stringify(data.pros) : null}::jsonb, pros),
      cons = COALESCE(${data.cons ? JSON.stringify(data.cons) : null}::jsonb, cons),
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

// ─── Translations ────────────────────────────────────────────────────────────

export type TranslationRow = {
  id: number
  article_slug: string
  locale: string
  title: string
  excerpt: string
  content: string
  meta_title: string | null
  meta_description: string | null
  translated_at: string
}

export async function createTranslationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS article_translations (
      id SERIAL PRIMARY KEY,
      article_slug TEXT NOT NULL,
      locale TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_title TEXT,
      meta_description TEXT,
      translated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(article_slug, locale)
    )
  `
}

export async function upsertTranslation(data: Omit<TranslationRow, "id" | "translated_at">): Promise<TranslationRow> {
  const rows = await sql`
    INSERT INTO article_translations (article_slug, locale, title, excerpt, content, meta_title, meta_description)
    VALUES (${data.article_slug}, ${data.locale}, ${data.title}, ${data.excerpt}, ${data.content}, ${data.meta_title ?? null}, ${data.meta_description ?? null})
    ON CONFLICT (article_slug, locale)
    DO UPDATE SET
      title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      content = EXCLUDED.content,
      meta_title = EXCLUDED.meta_title,
      meta_description = EXCLUDED.meta_description,
      translated_at = NOW()
    RETURNING *
  `
  return rows[0]
}

export async function getTranslation(slug: string, locale: string): Promise<TranslationRow | null> {
  const rows = await sql`
    SELECT * FROM article_translations
    WHERE article_slug = ${slug} AND locale = ${locale}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getTranslatedSlugsForLocale(locale: string): Promise<string[]> {
  const rows = await sql`
    SELECT article_slug FROM article_translations WHERE locale = ${locale}
  ` as { article_slug: string }[]
  return rows.map((r) => r.article_slug)
}

export async function getAllTranslationsForLocale(locale: string): Promise<TranslationRow[]> {
  return await sql`
    SELECT t.*, a.category_slug, a.thumbnail, a.date, a.read_time, a.author, a.rating
    FROM article_translations t
    JOIN articles a ON a.slug = t.article_slug
    WHERE t.locale = ${locale} AND a.published = true
    ORDER BY a.date DESC
  ` as TranslationRow[]
}

export async function getTranslationLocalesBySlug(): Promise<Record<string, string[]>> {
  const rows = await sql`
    SELECT article_slug, locale FROM article_translations ORDER BY article_slug, locale
  ` as { article_slug: string; locale: string }[]
  const map: Record<string, string[]> = {}
  for (const row of rows) {
    if (!map[row.article_slug]) map[row.article_slug] = []
    map[row.article_slug].push(row.locale)
  }
  return map
}
