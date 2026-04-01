import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAllArticles, createArticle } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const articles = await getAllArticles()
    return NextResponse.json(articles)
  } catch (error) {
    console.error('Failed to fetch articles:', error)
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await request.json()
    const article = await createArticle(data)
    return NextResponse.json(article, { status: 201 })
  } catch (error: any) {
    console.error('Failed to create article:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to create article' }, { status: 500 })
  }
}
