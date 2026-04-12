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
    const { content, keyword } = await request.json()
    const excerpt = typeof content === 'string' ? content.slice(0, 600) : ''

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a visual creative director generating Higgsfield AI image prompts for featured article images on a professional crypto/trading website.

Generate a single cinematic image prompt for the featured image of this article.

Rules:
- 2-4 sentences describing scene, composition, lighting, and mood
- Cinematic, professional, high-end feel
- Relevant to the article topic (trading, crypto exchanges, financial platforms)
- Use visual language: shallow depth of field, bokeh, dramatic lighting, wide angle, etc.
- NO text overlays, logos, UI elements, or screens showing data
- Think: a scene that conveys trust, technology, and financial expertise
- Output only the prompt — no preamble, no explanation

KEYWORD: ${keyword}
ARTICLE EXCERPT: ${excerpt}`,
      }],
    })

    const prompt = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    return NextResponse.json({ prompt })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Image prompt generation failed' }, { status: 500 })
  }
}
