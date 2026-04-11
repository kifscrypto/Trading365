import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'No content provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const articles = await getPublishedArticles()
    const siteUrls = articles
      .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
      .join('\n')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
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

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message ?? 'Analysis failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
