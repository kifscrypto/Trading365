import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { updateArticle, deleteArticle, setArticlePublished } from '@/lib/db'
import { pingIndexNow, articleUrl } from '@/lib/indexnow'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const data = await request.json()
    const article = await updateArticle(parseInt(id), data)
    pingIndexNow([articleUrl(article.category_slug, article.slug)])
    return NextResponse.json(article)
  } catch (error: any) {
    console.error('Failed to update article:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to update article' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { published } = await request.json()
    const article = await setArticlePublished(parseInt(id), published)
    if (published) pingIndexNow([articleUrl(article.category_slug, article.slug)])
    return NextResponse.json(article)
  } catch (error: any) {
    console.error('Failed to toggle publish:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to toggle publish' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    await deleteArticle(parseInt(id))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete article:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to delete article' }, { status: 500 })
  }
}
