import { NextRequest, NextResponse } from "next/server"
import { isValidLocale, getLocale } from "@/lib/i18n/config"
import { getAllTranslationsForLocale } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: { locale: string } }
) {
  if (!isValidLocale(params.locale)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const loc = getLocale(params.locale)!
  let translations: Awaited<ReturnType<typeof getAllTranslationsForLocale>> = []

  try {
    translations = await getAllTranslationsForLocale(params.locale)
  } catch {
    // DB unavailable — return minimal file
  }

  const BASE_URL = "https://www.trading365.org"
  const lines: string[] = [
    `# Trading365 — ${loc.fullName} (${loc.name})`,
    `# AI assistant context file for localised content`,
    `# Language: ${loc.fullName} | Code: ${params.locale}`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `> Trading365 provides cryptocurrency exchange reviews, comparisons, and exclusive bonus deals.`,
    `> This file contains ${loc.fullName}-language content published at ${BASE_URL}/${params.locale}`,
    ``,
    `## Language Homepage`,
    ``,
    `- ${BASE_URL}/${params.locale}`,
    ``,
  ]

  if (translations.length > 0) {
    lines.push(`## Translated Articles (${translations.length})`, ``)
    for (const t of translations) {
      const cat = (t as any).category_slug || "reviews"
      lines.push(`### ${t.title}`)
      lines.push(`URL: ${BASE_URL}/${params.locale}/${cat}/${t.article_slug}`)
      if (t.excerpt) lines.push(`Summary: ${t.excerpt}`)
      lines.push(``)
    }
  } else {
    lines.push(`## Status`, ``, `${loc.fullName} translations are being prepared. Full English content available at ${BASE_URL}/llms.txt`, ``)
  }

  lines.push(
    `## Full English Content`,
    ``,
    `For complete exchange data, ratings, FAQs, and methodology in English:`,
    `- ${BASE_URL}/llms.txt`,
    `- ${BASE_URL}/llms-full.txt`,
    ``
  )

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
