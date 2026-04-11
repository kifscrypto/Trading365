import { NextResponse } from 'next/server'
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { keyword, serpResults: existingSerp } = await request.json()
    if (!keyword?.trim()) return NextResponse.json({ error: 'Keyword required' }, { status: 400 })

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

    const message = await anthropic.messages.create({
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

    const analysis = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ keyword, analysis })
  } catch (error: any) {
    console.error('SEO weaknesses error:', error)
    return NextResponse.json({ error: error.message ?? 'Analysis failed' }, { status: 500 })
  }
}
