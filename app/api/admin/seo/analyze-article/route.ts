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
        content: `You are a crypto content strategist auditing an existing article for Trading365.

Article:
${articleContent}

Available site pages for internal linking:
${siteUrls.slice(0, 60 * 60) || 'None available'}

Analyze and return ONLY valid JSON (no markdown wrapper):
{
  "overall_score": 72,
  "priority_actions": [
    "Most impactful fix — specific",
    "Second most impactful",
    "Third most impactful"
  ],
  "weaknesses": [
    "Specific content weakness 1",
    "Specific content weakness 2",
    "Specific content weakness 3",
    "Specific content weakness 4",
    "Specific content weakness 5"
  ],
  "compression_suggestions": [
    "Section X can be cut by Y% because...",
    "Repeated idea detected: '...' appears in paragraphs X and Y",
    "Intro is Z words — cut to W words by removing..."
  ],
  "linking_suggestions": [
    "In paragraph N, after mentioning X — link 'anchor text' to /path",
    "End of article: add related reading — /path (Title)"
  ]
}

overall_score: rate 0–100 based on quality, specificity, decision-clarity, and conversion potential.
Be specific. "Improve content quality" is not acceptable feedback.`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    return NextResponse.json(analysis)
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Analysis failed' }, { status: 500 })
  }
}
