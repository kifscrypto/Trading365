import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getArticleBySlugFromDB } from '@/lib/data/articles-db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 60

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    let { content, title, url } = body as { content?: string; title?: string; url?: string }

    // Admin list passes just a slug — look the article up server-side.
    if (body.slug && (!content || !url)) {
      const article = await getArticleBySlugFromDB(body.slug)
      if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 })
      content = article.content
      title = article.title
      url = `https://trading365.org/${article.categorySlug}/${article.slug}`
    }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Article url (or a valid slug) is required' }, { status: 400 })
    }
    const excerpt = typeof content === 'string' ? content.slice(0, 4000) : ''

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Write social media promo posts for this newly published crypto/trading article.

Goal: drive readers to the article without sounding spammy. Lead with genuine value/insight, not hype.

Rules:
- reddit_title: 60-100 characters, specific and discussion-worthy (NOT clickbait). No hashtags, no emojis.
- reddit_body: 2-4 short sentences that summarise the key takeaway / what the reader will learn, written like a helpful human sharing something useful. End with the article link on its own line. No hashtags.
- x_post: ONE post, MAX 280 characters TOTAL including the link and hashtags. Punchy hook + the link + 1-2 relevant hashtags (e.g. #crypto #trading). Count characters carefully — it must be <= 280.
- Use the exact ARTICLE URL provided; never invent or alter it.

Return valid JSON only — no markdown wrapper, no explanation:
{
  "reddit_title": "...",
  "reddit_body": "...",
  "x_post": "..."
}

ARTICLE TITLE: ${title ?? ''}
ARTICLE URL: ${url}
ARTICLE CONTENT: ${excerpt}`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    let parsed: { reddit_title: string; reddit_body: string; x_post: string }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch {
      return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
    }

    return NextResponse.json({
      reddit_title: parsed.reddit_title ?? '',
      reddit_body: parsed.reddit_body ?? '',
      x_post: parsed.x_post ?? '',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Social post generation failed' }, { status: 500 })
  }
}
