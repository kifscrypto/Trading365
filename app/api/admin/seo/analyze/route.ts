import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { scrapeSerp } from '@/lib/seo/scraper'

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
    const { keyword } = await request.json()
    if (!keyword?.trim()) return NextResponse.json({ error: 'Keyword required' }, { status: 400 })

    const serpResults = await scrapeSerp(keyword.trim())
    const hasSerpData = serpResults.length > 0

    const serpData = hasSerpData
      ? serpResults.map((r) =>
          `${r.position}. "${r.title}"\n   URL: ${r.url}\n   Snippet: ${r.snippet || 'n/a'}`
        ).join('\n\n')
      : `No live SERP data retrieved. Apply your training knowledge of what typically ranks for crypto exchange content related to "${keyword}".`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an SEO strategist focused on beating current SERP results, not copying them.

Analyze the keyword below using the provided SERP data.

Your job:
- Identify the TRUE search intent
- Explain what Google is currently rewarding
- Identify patterns across top ranking pages
- Identify at least 6 SPECIFIC weaknesses in those pages
- Recommend a clear strategy to outperform them

STRICT RULES:
- No generic SEO advice
- No fluff
- No long paragraphs
- Every point must be actionable
- Write in plain English

OUTPUT FORMAT (FOLLOW EXACTLY):

## Search Intent
[One line only]

## What Google Rewards
[2–3 sentences max]

## Top Ranking Patterns
- ...
- ...
- ...

## SERP Weaknesses
- ...
- ...
- ...
(minimum 6)

## Recommended Strategy
- ...
- ...
- ...
(3–5 bullets max)

---

KEYWORD:
${keyword}

SERP DATA:
${serpData}`,
      }],
    })

    const analysis = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ keyword, serpResults, hasSerpData, analysis })
  } catch (error: any) {
    console.error('SEO analyze error:', error)
    return NextResponse.json({ error: error.message ?? 'Analysis failed' }, { status: 500 })
  }
}
