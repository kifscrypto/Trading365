import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getArticleById, updateArticle } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { articleId } = await request.json()
    if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

    const article = await getArticleById(parseInt(articleId))
    if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

    // Already has it
    if (article.content.toLowerCase().includes('our experience')) {
      return NextResponse.json({ skipped: true, reason: 'Already has section' })
    }

    const isHtml = /<[a-z][\s\S]*>/i.test(article.content)

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      messages: [{
        role: 'user',
        content: `You are editing a crypto article for trading365.org.

TASK: Add an "Our Experience Using [Exchange Name]" section if this is an exchange review or comparison.

SECTION REQUIREMENTS:
- Heading: match existing style — ${isHtml ? '<h2>Our Experience Using [Name]</h2>' : '## Our Experience Using [Name]'}
- 150–250 words
- First person plural: "At Trading365, we..." or "We tested..."
- Cover: signing up, trading interface, daily use, what surprised us, friction points
- Be specific to this exchange (fees, interface quirks, deposit methods)
- Match the writing style and tone of the rest of the article exactly

PLACEMENT:
- Insert it naturally — after the initial overview/hook sections, before the detailed features breakdown
- Look for a natural break (a <hr> tag, or after the first 2–3 overview sections)

IF this article is NOT an exchange review or comparison (e.g. educational guide, how-to, roundup like "Best Exchanges", "What Is KYC", "CEX vs DEX", "Top 5"):
Respond with ONLY the word: SKIP

OTHERWISE:
Return ONLY the complete modified article — no explanation, no "Here is the updated article:", no preamble

ARTICLE TITLE: ${article.title}

ARTICLE:
${article.content}`,
      }],
    })

    const result = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    if (result === 'SKIP' || result.toUpperCase().startsWith('SKIP')) {
      return NextResponse.json({ skipped: true, reason: 'Not applicable for this article type' })
    }

    // Save back to DB
    await updateArticle(article.id, { content: result })

    return NextResponse.json({ success: true, skipped: false })
  } catch (error: any) {
    console.error('generate-section error:', error)
    return NextResponse.json({ error: error.message ?? 'Generation failed' }, { status: 500 })
  }
}
