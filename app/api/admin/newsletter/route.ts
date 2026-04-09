import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getArticleBySlugFromDB } from '@/lib/data/articles-db'
import { createBeehiivDraft } from '@/lib/beehiiv'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  if (!cookieStore.get('admin_auth')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const article = await getArticleBySlugFromDB(slug)
  if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

  try {
    const { id, url } = await createBeehiivDraft({
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      category: article.category,
      categorySlug: article.categorySlug,
      thumbnail: article.thumbnail ?? null,
      rating: article.rating ?? null,
    })
    return NextResponse.json({ success: true, id, url })
  } catch (err: any) {
    console.error('Beehiiv draft error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to create draft' }, { status: 500 })
  }
}
