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

// Tool the model must call — guarantees parseable structured output and lets it
// return ONLY the fields the instruction actually changed (body, pros/cons, SEO…).
const APPLY_EDITS_TOOL: Anthropic.Tool = {
  name: 'apply_edits',
  description:
    'Return the article fields you modified. Include ONLY the fields the instruction changed; omit every field you left unchanged.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The FULL modified article body (not a fragment) in the SAME format (HTML or Markdown) as the original.',
      },
      excerpt: { type: 'string', description: 'Short article summary/excerpt.' },
      pros: { type: 'array', items: { type: 'string' }, description: 'Complete replacement list of pros.' },
      cons: { type: 'array', items: { type: 'string' }, description: 'Complete replacement list of cons.' },
      meta_title: { type: 'string', description: 'SEO meta title.' },
      meta_description: { type: 'string', description: 'SEO meta description.' },
      meta_keywords: { type: 'string', description: 'SEO keywords, comma-separated.' },
      faqs: {
        type: 'array',
        description: 'Complete replacement list of FAQs.',
        items: {
          type: 'object',
          properties: { question: { type: 'string' }, answer: { type: 'string' } },
          required: ['question', 'answer'],
        },
      },
    },
  },
}

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { content, prompt } = body
    const { title, excerpt, meta_title, meta_description, meta_keywords, pros, cons, faqs } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const contentIsHtml = isHtml(content)
    const formatNote = contentIsHtml
      ? 'The article body is HTML — preserve all HTML tags and structure, and return valid HTML.'
      : 'The article body is Markdown — preserve all Markdown syntax (headings, bold, italic, tables, lists, code blocks, horizontal rules).'

    const currentFields = `CURRENT ARTICLE FIELDS
Title: ${title ?? ''}
Excerpt: ${excerpt ?? ''}
SEO meta title: ${meta_title ?? ''}
SEO meta description: ${meta_description ?? ''}
SEO meta keywords: ${meta_keywords ?? ''}
Pros: ${JSON.stringify(pros ?? [])}
Cons: ${JSON.stringify(cons ?? [])}
FAQs: ${JSON.stringify(faqs ?? [])}

ARTICLE BODY (${contentIsHtml ? 'HTML' : 'Markdown'}):
${content}`

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      tools: [APPLY_EDITS_TOOL],
      tool_choice: { type: 'tool', name: 'apply_edits' },
      messages: [
        {
          role: 'user',
          content: `You are an article editor for a trading and finance website. Apply the instruction below to the article, then call apply_edits with ONLY the fields you changed.

INSTRUCTION: ${prompt}

${formatNote}

Rules:
- Only change what the instruction explicitly asks for. Leave every other field untouched — and OMIT unchanged fields from the tool call.
- If the instruction targets the pros/cons or the SEO meta fields, update those fields (not just the body).
- "pros", "cons" and "faqs" are full-list replacements — include the complete updated list, not just the delta.
- When you return "content", return the entire body in the same format, with only the requested changes applied.

${currentFields}`,
        },
      ],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      // Fell back to plain text — treat it as a body edit so the feature still works.
      const text = message.content.find((b) => b.type === 'text')
      if (text && text.type === 'text') {
        return NextResponse.json({ edits: { content: text.text.trim() } })
      }
      return NextResponse.json({ error: 'No edits returned' }, { status: 500 })
    }

    return NextResponse.json({ edits: toolUse.input })
  } catch (error: any) {
    console.error('edit-with-prompt error:', error)
    return NextResponse.json({ error: error.message ?? 'Edit failed' }, { status: 500 })
  }
}
