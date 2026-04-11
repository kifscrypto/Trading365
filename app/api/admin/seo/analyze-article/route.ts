import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 30

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, url } = await request.json()

    let articleContent = content?.trim() || ''

    if (!articleContent && url) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      })
      const html = await res.text()
      articleContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000)
    }

    if (!articleContent) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 })
    }

    const articles = await getPublishedArticles()
    const siteUrls = articles
      .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
      .join('\n')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are an SEO and conversion auditor.

Your job is to evaluate the article and identify:
- weaknesses
- missed opportunities
- what to fix FIRST

STRICT RULES:
- Score must be realistic
- No generic feedback
- Focus on ranking + conversion

OUTPUT FORMAT:

## Overall Score: XX / 100

## Top 3 Priority Actions

1. ...
2. ...
3. ...

## Key Weaknesses

- ...
- ...

## Compression Summary

- ...
- ...

## Internal Linking Gaps

- ...
- ...

---

ARTICLE:
${articleContent}

SITE PAGES (for linking gaps):
${siteUrls || 'None available'}`,
      }],
    })

    const analysis = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ analysis })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Analysis failed' }, { status: 500 })
  }
}
