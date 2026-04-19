import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 120

function isHtml(content: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|br|blockquote|a|span|pre|code|hr|img)\b/i.test(content)
}

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, prompt } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const contentIsHtml = isHtml(content)
    const formatNote = contentIsHtml
      ? 'The content is HTML. Preserve all HTML tags and structure. Return valid HTML.'
      : 'The content is Markdown. Preserve all Markdown syntax — headings, bold, italic, tables, lists, code blocks, horizontal rules.'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are an article editor for a trading and finance website. Apply the following instruction to the article content below.

INSTRUCTION: ${prompt}

${formatNote}

Rules:
- Only change what the instruction explicitly asks for
- Preserve all formatting, structure, and content not mentioned in the instruction
- Return ONLY the modified article content — no explanation, no preamble, no markdown fences wrapping the output
- If the instruction cannot be applied, return the original content unchanged

ARTICLE CONTENT:
${content}`,
      }],
    })

    const modified = message.content[0].type === 'text' ? message.content[0].text.trim() : content

    return NextResponse.json({ content: modified })
  } catch (error: any) {
    console.error('edit-with-prompt error:', error)
    return NextResponse.json({ error: error.message ?? 'Edit failed' }, { status: 500 })
  }
}
