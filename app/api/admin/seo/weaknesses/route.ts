import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { scrapeSerp, type SerpResult } from '@/lib/seo/scraper'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 60

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { keyword, serpResults: existingSerp } = await request.json()
    if (!keyword?.trim()) {
      return new Response(JSON.stringify({ error: 'Keyword required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Use existing SERP data if passed, otherwise scrape fresh
    const serpResults: SerpResult[] = existingSerp?.length
      ? existingSerp
      : await scrapeSerp(keyword.trim())

    const serpData = serpResults.length > 0
      ? serpResults.map((r) =>
          `${r.position}. "${r.title}"\n   URL: ${r.url}\n   Snippet: ${r.snippet || 'n/a'}`
        ).join('\n\n')
      : `No live SERP data. Apply your training knowledge of crypto exchange content ranking for "${keyword}".`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `You are an SEO strategist.

Your job is to identify EXACTLY where current top-ranking pages are weak and how to beat them.

Do NOT summarize competitors.
Do NOT give generic advice.

Focus only on:
- what is missing
- what is weak
- how to exploit it

STRICT RULES:
- Minimum 4 weaknesses
- Each weakness must include:
  - what's wrong
  - why it matters
  - how to exploit it
- Be specific and actionable

OUTPUT FORMAT:

## Critical Weaknesses in Current SERP

1. **[Weakness title]**
   - What's wrong:
   - Why it matters:
   - How to exploit it:

2. ...

---

KEYWORD:
${keyword}

SERP DATA:
${serpData}`,
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
    console.error('SEO weaknesses error:', error)
    return new Response(JSON.stringify({ error: error.message ?? 'Analysis failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
