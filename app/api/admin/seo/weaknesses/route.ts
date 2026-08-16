import { kimiChatStream } from '@/lib/kimi'
import { verifyAdmin } from '@/lib/auth'
import { scrapeSerp, type SerpResult } from '@/lib/seo/scraper'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
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

    const promptContent = `You are an SEO strategist.

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
${serpData}`

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const deltas = kimiChatStream([{ role: 'user', content: promptContent }], { maxTokens: 2500 })
          for await (const text of deltas) {
            controller.enqueue(encoder.encode(text))
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
