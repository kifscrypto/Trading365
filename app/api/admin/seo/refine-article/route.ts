import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { content, instructions, keyword } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are refining an existing article based on specific instructions.

RULES:
- Apply ONLY the changes described in the instructions
- Preserve everything else exactly as written
- Do not add unrequested sections or remove content unless instructed
- Do not add commentary, preamble, or explanation
- Output the complete revised article only

KEYWORD: ${keyword ?? ''}

REFINEMENT INSTRUCTIONS:
${instructions}

EXISTING ARTICLE:
${content}`,
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
    return new Response(JSON.stringify({ error: error.message ?? 'Refinement failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
