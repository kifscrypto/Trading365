import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

function extractJson(text: string, fallback: unknown) {
  const arr = text.match(/\[[\s\S]*\]/)
  if (arr) { try { return JSON.parse(arr[0]) } catch {} }
  return fallback
}

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, mode } = await request.json()
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const results: Record<string, unknown> = {}

    if (mode === 'compress' || mode === 'both') {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are a content optimization expert.

Your job is to identify:
- where content is too long
- where ideas repeat
- what can be removed or tightened

STRICT RULES:
- Be specific
- Quantify reductions
- No vague advice

OUTPUT FORMAT:

## Compression Opportunities

1. **[Section Name]**
   - Can reduce by: XX%
   - Issue:
   - Fix:

2. **Repeated Ideas**
   - "[idea]" appears X times
   - Keep strongest version, remove others

3. **Unnecessary Sections**
   - [Section]
   - Reason:

---

ARTICLE:
${content}`,
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      results.compressionMarkdown = raw
    }

    if (mode === 'links' || mode === 'both') {
      const articles = await getPublishedArticles()
      const sitePages = articles
        .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
        .join('\n')

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an SEO internal linking specialist.

Your job is to suggest EXACT internal links.

STRICT RULES:
- Must include placement (where in article)
- Must include anchor text
- Must include reason
- No vague suggestions

OUTPUT FORMAT:

## Internal Link Opportunities

1. **[Section or Paragraph]**
   - Anchor: "[exact phrase]"
   - Link to: [URL or slug]
   - Reason:

2. ...

## End of Article Links

- [Comparison page]
- [Review]
- [Guide]

---

ARTICLE:
${content}

SITE PAGES:
${sitePages}`,
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      results.linkingMarkdown = raw
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Optimization failed' }, { status: 500 })
  }
}
