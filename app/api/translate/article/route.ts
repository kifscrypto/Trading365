import { NextRequest, NextResponse } from "next/server"
import { getArticleBySlug, upsertTranslation, getAllArticles } from "@/lib/db"
import { translateArticle } from "@/lib/i18n/translate"
import { isValidLocale, LOCALE_CODES } from "@/lib/i18n/config"
import type { LocaleCode } from "@/lib/i18n/config"

// POST /api/translate/article — translate a single article into one or all locales
export async function POST(req: NextRequest) {
  const { slug, locale, all_locales } = await req.json()

  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })

  const article = await getArticleBySlug(slug)
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 })

  const localesToProcess: LocaleCode[] = all_locales
    ? (LOCALE_CODES as LocaleCode[])
    : locale && isValidLocale(locale)
    ? [locale]
    : null!

  if (!localesToProcess) return NextResponse.json({ error: "Valid locale or all_locales:true required" }, { status: 400 })

  const results: Record<string, string> = {}

  for (const loc of localesToProcess) {
    try {
      const translated = await translateArticle(
        {
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          metaTitle: article.meta_title ?? undefined,
          metaDescription: article.meta_description ?? undefined,
        },
        loc
      )

      await upsertTranslation({
        article_slug: slug,
        locale: loc,
        title: translated.title,
        excerpt: translated.excerpt,
        content: translated.content,
        meta_title: translated.metaTitle,
        meta_description: translated.metaDescription,
      })

      results[loc] = "success"
      console.log(`[i18n] Translated ${slug} → ${loc}`)
    } catch (err) {
      results[loc] = `error: ${String(err)}`
      console.error(`[i18n] Failed to translate ${slug} → ${loc}:`, err)
    }
  }

  return NextResponse.json({ slug, results })
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
