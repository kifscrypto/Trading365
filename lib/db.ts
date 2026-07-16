import { neon, types } from '@neondatabase/serverless'
import { randomBytes } from 'node:crypto'
import { sanitizeInternalLinks } from '@/lib/seo/sanitize-internal-links'
import { stripBodyFaqSection } from '@/lib/seo/strip-body-faq'
import { stripYearFromSlug } from '@/lib/utils/slug'
import { canonicalYouTubeUrl } from '@/lib/youtube'

// Return DATE columns (oid 1082) as raw 'YYYY-MM-DD' strings, not TZ-shifted JS
// Dates (Neon's default parses '2025-06-30' to local-midnight → the prior day in
// UTC). Scoped: articles.video_recorded_date is the only DATE column in the DB.
types.setTypeParser(1082, (v) => v)

export const sql = neon(process.env.DATABASE_URL!)

/**
 * Validate + canonicalize the optional video fields on write. Empty URL → both
 * null (no video anywhere). A present URL must be a valid YouTube watch/youtu.be
 * link and must carry a recorded date (required for valid VideoObject markup and
 * the staleness caveat).
 */
function prepareVideoFields(
  video_url: string | null | undefined,
  video_recorded_date: string | null | undefined,
): { video_url: string | null; video_recorded_date: string | null } {
  const raw = (video_url ?? '').trim()
  if (!raw) return { video_url: null, video_recorded_date: null }
  const canonical = canonicalYouTubeUrl(raw)
  if (!canonical) throw new Error('Invalid YouTube URL — use a youtube.com/watch?v= or youtu.be/ link.')
  const date = (video_recorded_date ?? '').toString().trim()
  if (!date) throw new Error('A recorded date is required when a video URL is set.')
  return { video_url: canonical, video_recorded_date: date }
}

/**
 * Strip/repair dead internal links in an article body before it is written.
 * Excludes the article's own slug from the valid set is unnecessary — self
 * links are harmless — so we validate against every existing slug.
 */
async function cleanInternalLinks(content: string | undefined | null): Promise<string | undefined | null> {
  if (!content) return content
  const articles = (await sql`SELECT category_slug, slug FROM articles`) as { category_slug: string; slug: string }[]
  const { content: cleaned, fixes } = sanitizeInternalLinks(content, articles)
  if (fixes.length) {
    console.warn(`[sanitizeInternalLinks] ${fixes.length} dead internal link(s) repaired:`,
      fixes.map(f => f.to ? `${f.from} -> ${f.to}` : `${f.from} -> unwrapped ("${f.anchor}")`))
  }
  return cleaned
}

/** URL-safe per-article secret used to share unpublished drafts for client review. */
export function newPreviewToken(): string {
  return randomBytes(24).toString('base64url')
}

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
  video_url: string | null
  video_recorded_date: string | null
  published: boolean
  preview_token: string | null
  created_at: string
  updated_at: string
}

export async function getArticleById(id: number): Promise<ArticleRow | null> {
  const rows = await sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`
  return rows[0] ?? null
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

/**
 * Fetch an article by slug REGARDLESS of published state — used only by the
 * token-gated preview route so clients can review drafts before publishing.
 */
export async function getArticleForPreviewBySlug(slug: string): Promise<ArticleRow | null> {
  const rows = await sql`
    SELECT * FROM articles WHERE slug = ${slug} LIMIT 1
  `
  return rows[0] ?? null
}

/** Rotate an article's preview token, invalidating any previously shared link. */
export async function regeneratePreviewToken(id: number): Promise<string> {
  const token = newPreviewToken()
  await sql`UPDATE articles SET preview_token = ${token}, updated_at = NOW() WHERE id = ${id}`
  return token
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

export async function createArticle(data: Omit<ArticleRow, 'id' | 'created_at' | 'updated_at' | 'preview_token'>): Promise<ArticleRow> {
  let content = await cleanInternalLinks(data.content)
  // FAQs live in the structured `faqs` field — strip any duplicate body FAQ section.
  if (content && (data.faqs?.length ?? 0) > 0) {
    const { content: c2, stripped } = stripBodyFaqSection(content)
    if (stripped) { console.warn(`[stripBodyFaqSection] removed duplicate body FAQ from new article "${data.slug}"`); content = c2 }
  }
  // Keep new URLs evergreen — a year in the slug forces a 301 every January.
  // Only applied on create; existing slugs are never rewritten (would break links).
  const slug = stripYearFromSlug(data.slug)
  const video = prepareVideoFields(data.video_url, data.video_recorded_date)
  const rows = await sql`
    INSERT INTO articles (
      slug, title, excerpt, content, category, category_slug,
      date, updated_date, read_time, author, rating, thumbnail, tags, faqs, pros, cons,
      meta_title, meta_description, meta_keywords, video_url, video_recorded_date, preview_token
    ) VALUES (
      ${slug}, ${data.title}, ${data.excerpt}, ${content},
      ${data.category}, ${data.category_slug}, ${data.date}, ${data.updated_date ?? null},
      ${data.read_time}, ${data.author}, ${data.rating}, ${data.thumbnail},
      ${data.tags}, ${JSON.stringify(data.faqs ?? [])},
      ${JSON.stringify(data.pros ?? [])}, ${JSON.stringify(data.cons ?? [])},
      ${data.meta_title ?? null}, ${data.meta_description ?? null}, ${data.meta_keywords ?? null},
      ${video.video_url}, ${video.video_recorded_date}::date, ${newPreviewToken()}
    )
    RETURNING *
  `
  return rows[0]
}

export async function updateArticle(id: number, data: Partial<Omit<ArticleRow, 'id' | 'created_at' | 'updated_at'>>): Promise<ArticleRow> {
  let content = await cleanInternalLinks(data.content)
  // Strip a duplicate body FAQ when the structured `faqs` field is (or stays) populated.
  if (content) {
    const faqCount = data.faqs !== undefined
      ? (data.faqs?.length ?? 0)
      : (((await sql`SELECT faqs FROM articles WHERE id = ${id}`)[0]?.faqs as unknown[] | null)?.length ?? 0)
    if (faqCount > 0) {
      const { content: c2, stripped } = stripBodyFaqSection(content)
      if (stripped) { console.warn(`[stripBodyFaqSection] removed duplicate body FAQ from article id ${id}`); content = c2 }
    }
  }
  // Only touch the video columns when the caller actually sent them (the admin
  // form always does). Partial updates from other routes must leave them intact.
  const videoProvided = data.video_url !== undefined || data.video_recorded_date !== undefined
  const video = videoProvided ? prepareVideoFields(data.video_url, data.video_recorded_date) : null
  const rows = await sql`
    UPDATE articles SET
      slug = COALESCE(${data.slug ?? null}, slug),
      title = COALESCE(${data.title ?? null}, title),
      excerpt = COALESCE(${data.excerpt ?? null}, excerpt),
      content = COALESCE(${content ?? null}, content),
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
      video_url = CASE WHEN ${videoProvided} THEN ${video ? video.video_url : null} ELSE video_url END,
      video_recorded_date = CASE WHEN ${videoProvided} THEN ${video ? video.video_recorded_date : null}::date ELSE video_recorded_date END,
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

export async function getTranslatedLocalesForSlug(slug: string): Promise<string[]> {
  const rows = await sql`
    SELECT locale FROM article_translations WHERE article_slug = ${slug}
  ` as { locale: string }[]
  return rows.map((r) => r.locale)
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
