import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { kimiChat } from '@/lib/kimi'
import { isGeneric } from '@/lib/seo/templates'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, keyword, title, articleType } = await request.json()
    const excerpt = typeof content === 'string' ? content.slice(0, 2000) : ''

    // Reviews get the exchange fact sheet; generic/educational articles get
    // facts appropriate to the piece — or nothing when the body has none.
    // articleType is optional: callers that omit it keep the review behavior.
    const quickFactsRule = isGeneric(articleType)
      ? '- quick_facts_md: a markdown table with 4-8 quick facts APPROPRIATE to this article — e.g. for a comparison: the entities compared, the best-for verdicts, key stats stated in the body; for a guide or how-to: key takeaways, requirements, or figures stated in the body. Include ONLY facts the article body actually states — NEVER output placeholder rows like "Article does not specify X". If the article has no meaningful quick facts, return an empty string.'
      : '- quick_facts_md: a markdown table with 6-8 key facts (Founded, Headquarters, Maker Fee, Taker Fee, Max Leverage, KYC Required, Min Deposit, Withdrawal Speed). Use actual values from the article — do NOT invent data not mentioned in the article.'

    const raw = (await kimiChat([{
      role: 'user',
      content: `Generate SEO metadata, pros/cons, and quick facts for this crypto/trading article.

Rules:
- meta_title: 50-60 characters, includes keyword, compelling
- meta_description: 145-155 characters, includes keyword, drives clicks, no filler
- meta_keywords: 5-8 comma-separated keywords, most important first
- pros: 4-6 specific, honest advantages (no fluff like "user-friendly")
- cons: 3-4 specific, honest disadvantages (regulatory risk, UX issues, fees, limits)
${quickFactsRule}
- faqs: 5-7 questions real users search for, with concise 2-4 sentence answers. Mix informational and decision-intent questions. No generic questions like "Is X safe?" without a specific answer.

Return valid JSON only — no markdown wrapper, no explanation:
{
  "meta_title": "...",
  "meta_description": "...",
  "meta_keywords": "...",
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "quick_facts_md": "| Field | Details |\\n|-------|---------|\\n| **Founded** | ... |\\n...",
  "faqs": [
    { "question": "...", "answer": "..." }
  ]
}

KEYWORD: ${keyword}
ARTICLE TITLE: ${title ?? ''}
ARTICLE CONTENT: ${excerpt}`,
    }], { maxTokens: 2000, json: true })).trim()

    let parsed: {
      meta_title: string
      meta_description: string
      meta_keywords: string
      pros: string[]
      cons: string[]
      quick_facts_md: string
      faqs: { question: string; answer: string }[]
    }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch {
      return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
    }

    return NextResponse.json({
      meta_title: parsed.meta_title ?? '',
      meta_description: parsed.meta_description ?? '',
      meta_keywords: parsed.meta_keywords ?? '',
      pros: Array.isArray(parsed.pros) ? parsed.pros : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons : [],
      quick_facts_md: parsed.quick_facts_md ?? '',
      faqs: Array.isArray(parsed.faqs) ? parsed.faqs : [],
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Meta tag generation failed' }, { status: 500 })
  }
}
