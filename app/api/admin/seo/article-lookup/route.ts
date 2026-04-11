import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import type { ArticleRow } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

// GET /api/admin/seo/article-lookup?url=https://trading365.org/reviews/mexc-review
export async function GET(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')?.trim()
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

    // Extract slug from path like /reviews/mexc-review or /no-kyc/bitunix-review
    let slug: string | null = null
    try {
      const path = new URL(url).pathname
      const parts = path.split('/').filter(Boolean)
      // Last segment is the slug
      slug = parts[parts.length - 1] ?? null
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    if (!slug) return NextResponse.json({ error: 'Could not extract slug from URL' }, { status: 400 })

    const rows = await sql`SELECT id, slug, title, content, category_slug FROM articles WHERE slug = ${slug} LIMIT 1` as Pick<ArticleRow, 'id' | 'slug' | 'title' | 'content' | 'category_slug'>[]
    if (!rows[0]) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

    const { id, slug: articleSlug, title, content, category_slug } = rows[0]
    return NextResponse.json({ id, slug: articleSlug, title, content, category_slug })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Lookup failed' }, { status: 500 })
  }
}
