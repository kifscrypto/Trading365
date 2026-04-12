import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

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
    const { content, keyword, title } = await request.json()
    const excerpt = typeof content === 'string' ? content.slice(0, 1200) : ''

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Generate SEO meta tags for this crypto/trading article.

Rules:
- meta_title: 50-60 characters, includes the main keyword naturally, compelling
- meta_description: 145-155 characters, includes keyword, drives clicks, no filler
- meta_keywords: 5-8 comma-separated keywords, most important first

Return valid JSON only — no markdown, no explanation:
{
  "meta_title": "...",
  "meta_description": "...",
  "meta_keywords": "..."
}

KEYWORD: ${keyword}
ARTICLE TITLE: ${title ?? ''}
ARTICLE EXCERPT: ${excerpt}`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    let parsed: { meta_title: string; meta_description: string; meta_keywords: string }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch {
      return NextResponse.json({ error: 'Failed to parse meta tags response' }, { status: 500 })
    }

    return NextResponse.json({
      meta_title: parsed.meta_title ?? '',
      meta_description: parsed.meta_description ?? '',
      meta_keywords: parsed.meta_keywords ?? '',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Meta tag generation failed' }, { status: 500 })
  }
}
