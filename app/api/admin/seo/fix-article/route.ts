import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getArticleById } from '@/lib/db'

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
    const { content, url, articleId, fix } = await request.json()

    if (!fix?.trim()) {
      return new Response(JSON.stringify({ error: 'Fix instruction required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    let articleContent = ''
    let isHtml = false

    // Priority: DB HTML (via articleId) → pasted content → URL fetch
    if (articleId) {
      const article = await getArticleById(parseInt(articleId))
      if (!article) return new Response(JSON.stringify({ error: 'Article not found in database' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      articleContent = article.content
      isHtml = true
    } else if (content?.trim()) {
      articleContent = content.trim()
      isHtml = /<[a-z][\s\S]*>/i.test(articleContent)
    } else if (url) {
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
        .slice(0, 15000)
    }

    if (!articleContent) {
      return new Response(JSON.stringify({ error: 'No article content to fix' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = isHtml
      ? `You are editing an HTML article for a crypto exchange review site.

Apply the following fix to the article below.

FIX TO APPLY:
${fix}

CRITICAL RULES:
- Return ONLY the HTML content — no intro, no explanation, no markdown fences
- Keep ALL existing HTML tags, attributes, and structure exactly as-is
- Only change text content where the fix requires it
- Apply ONLY the fix described above — change nothing else
- Maintain the same writing style and tone

ARTICLE HTML:
${articleContent}`
      : `You are a skilled editor for a crypto exchange review site.

Apply the following fix to the article below, then output the complete improved article.

FIX TO APPLY:
${fix}

CRITICAL RULES:
- Output ONLY the article — no intro like "Here is the updated article:", no explanation after
- Apply ONLY the fix above — change nothing else
- Keep all other sections word-for-word as written
- Maintain the exact same writing style and tone

ARTICLE:
${articleContent}`

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
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
    return new Response(JSON.stringify({ error: error.message ?? 'Fix failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
