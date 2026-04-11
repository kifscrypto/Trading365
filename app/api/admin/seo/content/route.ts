import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!cookieStore.get('admin_auth')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { keyword, outline, intent } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are a crypto content writer focused on ranking and conversion.

Your job is to write a COMPLETE article based on the structure provided.

STYLE:
- Human, direct, slightly blunt
- Opinionated when needed
- No fluff

REQUIREMENTS:
- Clear verdict early
- Include real negatives
- No repetition
- No generic sentences
- No filler content

STRICT RULES:
- Keep paragraphs tight
- No over-explaining
- Each section must add value

OUTPUT FORMAT:

## [Title]

## [Verdict Section]
(Max 1 paragraph)

## [Introduction]
(2–3 paragraphs)

## Our Experience Using [Exchange]
(150–250 words)

## [Core Sections]
(Only what's needed)

## [Comparison Section]

## Final Verdict
(2–3 paragraphs)

---

OUTLINE:
${outline}

KEYWORD:
${keyword}`,
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
    return new Response(JSON.stringify({ error: error.message ?? 'Content generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
