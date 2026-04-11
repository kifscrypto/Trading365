import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 30

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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this crypto article for compression opportunities.

Article:
${content}

Find and report:
1. Repeated ideas — same point made in multiple places
2. Bloated sections — section delivers less value than its word count
3. Padding sentences — sentences that add no meaning or information
4. Overlong intro or conclusion

Return ONLY a JSON array. Every item must:
- Reference a specific section name or paragraph number
- State exactly what to cut and why
- Be specific (not "section is too long" but "the intro spends 3 paragraphs on background the reader doesn't need — cut to a single sentence verdict")

Example format:
[
  "Intro (first 4 paragraphs) can be cut by ~60% — it explains what crypto is before getting to the review. Start with the verdict.",
  "The fee structure is explained in full in both the 'Fees' section and again in 'Final Verdict' — remove from Final Verdict",
  "Paragraph 7 repeats the KYC limit already stated in paragraph 2 — delete paragraph 7"
]`,
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
      results.compressionSuggestions = extractJson(raw, [])
    }

    if (mode === 'links' || mode === 'both') {
      const articles = await getPublishedArticles()
      const siteUrls = articles
        .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
        .join('\n')

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Suggest internal links for this article. Only suggest links that genuinely help the reader.

Article:
${content}

Available site pages:
${siteUrls}

Rules:
- Specify exact placement (paragraph number, section name, or after a specific phrase)
- Use natural anchor text that matches reader intent at that point in the article
- 3–6 links maximum — do not pad
- Include 1–2 end-of-article "related reading" suggestions

Return ONLY a JSON array:
[
  "In paragraph 3, after mentioning KYC-free withdrawals — link 'best no-KYC exchanges' to /no-kyc/best-no-kyc-exchanges",
  "In the Fees section, after the maker/taker rates — link 'compare fees against MEXC' to /comparisons/mexc-vs-[exchange]",
  "End of article: add related reading — /reviews/mexc-review (Best No-KYC Alternative) and /no-kyc/best-no-kyc-exchanges (Full No-KYC Rankings)"
]`,
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
      results.linkingSuggestions = extractJson(raw, [])
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Optimization failed' }, { status: 500 })
  }
}
