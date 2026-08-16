import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { kimiChat } from '@/lib/kimi'
import { getArticleById, updateArticle } from '@/lib/db'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
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

    const result = (await kimiChat([{
      role: 'user',
      content: `CRITICAL: Never wrap links in bold. Write [text](url) — NEVER **[text](url)**. This applies to every single link without exception.

You are editing a crypto article for trading365.org.

TASK: Add an "Our Experience Using [Exchange Name]" section if this is an exchange review or comparison.

SECTION REQUIREMENTS:
- Heading: match existing style — ${isHtml ? '<h2>Our Experience Using [Name]</h2>' : '## Our Experience Using [Name]'}
- 150–250 words
- First person plural: "At Trading365, we..." or "We tested..."
- Cover: signing up, trading interface, daily use, what surprised us, friction points
- Be specific to this exchange (fees, interface quirks, deposit methods)
- Match the writing style and tone of the rest of the article exactly
- Do NOT invent reviewer names, bylines, or credentials
- Do NOT add "Last updated:" or "Reviewed by:" lines
- The current year is 2026 — do not reference 2025 as current

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
    }], { maxTokens: 10000 })).trim()

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
