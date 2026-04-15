import { isValidLocale, getLocale } from "@/lib/i18n/config"
import { getAllTranslationsForLocale } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params

  if (!isValidLocale(locale)) {
    return new Response("Not found", { status: 404 })
  }

  const loc = getLocale(locale)!
  const base = "https://trading365.org"

  let translations: { article_slug: string; title: string; excerpt: string; category_slug?: string }[] = []
  try {
    translations = await getAllTranslationsForLocale(locale)
  } catch {
    // DB unavailable
  }

  const content = `# Trading365 — ${loc.flag} ${loc.fullName} Content

> This file lists all Trading365 content available in ${loc.fullName}.
> English content is at ${base}/llms.txt

## ${loc.fullName} Landing Page
- [Trading365 ${loc.name}](${base}/${locale}) — All ${loc.fullName} articles and reviews

## Translated Articles (${translations.length})
${translations.length === 0
  ? `No ${loc.fullName} translations available yet. See ${base}/llms.txt for English content.`
  : translations
      .map((t) => `- [${t.title}](${base}/${locale}/${(t as any).category_slug ?? "reviews"}/${t.article_slug}) — ${t.excerpt}`)
      .join("\n")
}

## Full English Content
For the complete exchange database and all articles in English, see ${base}/llms.txt
`

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
