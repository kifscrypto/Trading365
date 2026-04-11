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
        content: `You are a crypto exchange content expert writing for Trading365. Write a complete article from the outline below.

Keyword: "${keyword}"
Intent: ${intent}

Outline:
${outline}

TONE (non-negotiable):
- Slightly blunt and direct — take a clear position, don't hedge
- Write like a trader who has actually deposited money and used the platform
- No generic opener. Do not start with "In the world of crypto...", "Cryptocurrency has...", or any scene-setting fluff
- No filler phrases: "it's worth noting", "importantly", "it goes without saying", "at the end of the day"
- No repetition — make a point once and move on
- Include real negatives — if something is bad, say it plainly

CONTENT REQUIREMENTS:
- Open with the verdict or the most important finding — don't bury the lede
- Include specific data where possible: fees as exact percentages, leverage multiples, exact withdrawal limits, KYC thresholds
- Make comparisons concrete: "50% cheaper than Binance's taker fee" not "very competitive"
- End with a clear recommendation — tell the reader exactly what to do
- Write in Markdown format using ## for H2, ### for H3

Write the complete article now. No preamble, no explanation — just the article.`,
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
