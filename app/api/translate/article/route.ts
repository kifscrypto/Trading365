import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 300 // 5 minutes — needed for translating one article into all 9 locales
import { getArticleBySlug, upsertTranslation, getAllArticles } from "@/lib/db"
import { translateArticle } from "@/lib/i18n/translate"
import { isValidLocale, LOCALE_CODES } from "@/lib/i18n/config"
import type { LocaleCode } from "@/lib/i18n/config"

// POST /api/translate/article — translate a single article into one locale
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { slug, locale } = body

    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })
    if (!locale || !isValidLocale(locale)) return NextResponse.json({ error: "Valid locale required" }, { status: 400 })

    const article = await getArticleBySlug(slug)
    if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 })

    const results: Record<string, string> = {}

    try {
      const translated = await translateArticle(
        {
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          metaTitle: article.meta_title ?? undefined,
          metaDescription: article.meta_description ?? undefined,
        },
        locale as LocaleCode
      )

      await upsertTranslation({
        article_slug: slug,
        locale: locale as LocaleCode,
        title: translated.title,
        excerpt: translated.excerpt,
        content: translated.content,
        meta_title: translated.metaTitle,
        meta_description: translated.metaDescription,
      })

      results[locale] = "success"
      console.log(`[i18n] Translated ${slug} → ${locale}`)
    } catch (err) {
      results[locale] = `error: ${String(err)}`
      console.error(`[i18n] Failed to translate ${slug} → ${locale}:`, err)
    }

    return NextResponse.json({ slug, results })
  } catch (err) {
    console.error("[i18n] POST handler error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PUT /api/translate/article — translate ALL articles into all locales
export async function PUT() {
  try {
    const articles = await getAllArticles()
    const results: Record<string, Record<string, string>> = {}

    for (const article of articles) {
      results[article.slug] = {}
      for (const locale of LOCALE_CODES as LocaleCode[]) {
        try {
          const translated = await translateArticle(
            {
              title: article.title,
              excerpt: article.excerpt,
              content: article.content,
              metaTitle: article.meta_title ?? undefined,
              metaDescription: article.meta_description ?? undefined,
            },
            locale
          )

          await upsertTranslation({
            article_slug: article.slug,
            locale,
            title: translated.title,
            excerpt: translated.excerpt,
            content: translated.content,
            meta_title: translated.metaTitle,
            meta_description: translated.metaDescription,
          })

          results[article.slug][locale] = "success"
          console.log(`[i18n] Translated ${article.slug} → ${locale}`)
        } catch (err) {
          results[article.slug][locale] = `error: ${String(err)}`
          console.error(`[i18n] Failed ${article.slug} → ${locale}:`, err)
        }
      }
    }

    return NextResponse.json({ translated: Object.keys(results).length, results })
  } catch (err) {
    console.error("[i18n] PUT handler error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
