import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql } from "@/lib/db"

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get("admin_auth")
}

/**
 * POST /api/translate/repair
 * Cleans up broken translations for a given locale.
 * - Strips markdown heading prefixes (# / ## / ###) from title, excerpt, meta_title, meta_description
 * - Strips a leading "# Title line" from content when the content is otherwise HTML
 */
export async function POST(req: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { locale } = await req.json()
  if (!locale) return NextResponse.json({ error: "locale required" }, { status: 400 })

  // Fetch all translations for this locale
  const rows = await sql`
    SELECT id, article_slug, title, excerpt, content, meta_title, meta_description
    FROM article_translations
    WHERE locale = ${locale}
  ` as {
    id: number
    article_slug: string
    title: string
    excerpt: string
    content: string
    meta_title: string | null
    meta_description: string | null
  }[]

  let fixed = 0

  for (const row of rows) {
    const cleanTitle = stripMarkdownPrefix(row.title)
    const cleanExcerpt = stripMarkdownPrefix(row.excerpt)
    const cleanMetaTitle = row.meta_title ? stripMarkdownPrefix(row.meta_title) : row.meta_title
    const cleanMetaDesc = row.meta_description ? stripMarkdownPrefix(row.meta_description) : row.meta_description
    const cleanContent = cleanContentPrefix(row.content)

    const changed =
      cleanTitle !== row.title ||
      cleanExcerpt !== row.excerpt ||
      cleanMetaTitle !== row.meta_title ||
      cleanMetaDesc !== row.meta_description ||
      cleanContent !== row.content

    if (changed) {
      await sql`
        UPDATE article_translations SET
          title = ${cleanTitle},
          excerpt = ${cleanExcerpt},
          content = ${cleanContent},
          meta_title = ${cleanMetaTitle ?? null},
          meta_description = ${cleanMetaDesc ?? null},
          translated_at = NOW()
        WHERE id = ${row.id}
      `
      fixed++
      console.log(`[repair] Fixed ${row.article_slug} → ${locale}`)
    }
  }

  return NextResponse.json({ locale, checked: rows.length, fixed })
}

/** Strip leading # / ## / ### markdown heading prefix from a plain-text field */
function stripMarkdownPrefix(text: string): string {
  return text.replace(/^#+\s+/, "").trim()
}

/**
 * If content starts with a "# Title line" followed by actual HTML or markdown body,
 * strip that leading heading line — the title is already stored in its own field.
 */
function cleanContentPrefix(content: string): string {
  // Match a leading markdown H1 heading line (# ...) followed by a newline
  const match = content.match(/^#\s+[^\n]+\n+/)
  if (!match) return content

  // Only strip it if the rest of the content is non-trivial (not just the heading)
  const rest = content.slice(match[0].length).trim()
  if (rest.length < 50) return content // don't strip if almost nothing is left

  return rest
}
