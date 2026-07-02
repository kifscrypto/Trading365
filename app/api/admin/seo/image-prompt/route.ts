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
      model: 'claude-opus-4-8',
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
- ALWAYS include a bold text title overlay. Derive a short punchy title (4-7 words max) from the keyword and include it in the prompt EXACTLY as: with a bold title text overlay centered in the middle of the image, the text in white and gold, reading "[YOUR TITLE HERE]"
- TEXT REQUIREMENTS (NON-NEGOTIABLE — state all of these in the prompt every time):
  - The title text colour MUST be white and gold (white with gold accents)
  - The title MUST be CENTERED in the image — horizontally and vertically centered, in the middle of the frame
  - Compose the scene so the centre is clear/uncluttered for the centered title to sit legibly
- Think: a scene that conveys trust, technology, and financial expertise — with a clear, centered white-and-gold text title so the image works as a standalone featured image
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
