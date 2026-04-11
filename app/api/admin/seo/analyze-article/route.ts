import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { content, url } = await request.json()

    let articleContent = content?.trim() || ''

    if (!articleContent && url) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      })
      const html = await res.text()
      articleContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000)
    }

    if (!articleContent) {
      return new Response(JSON.stringify({ error: 'No content provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const articles = await getPublishedArticles()
    const siteUrls = articles
      .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
      .join('\n')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are an elite SEO and conversion auditor for Trading365.

Your job is NOT to give generic SEO advice.
Your job is to evaluate whether a page will RANK and CONVERT for crypto exchange queries.

CORE PRINCIPLE:
This is a decision-page audit.
The goal of the content is:
1. Rank for high-intent queries (e.g. "[exchange] review", "best no-KYC exchange")
2. Convert readers into signups

Prioritise: decision clarity, conversion flow, objection handling, internal linking strategy.
Do NOT prioritise: word count, "covering every topic", generic SEO completeness.

SCORING (out of 100):
- 30% Conversion strength (verdict clarity, CTA placement, objection handling)
- 25% Search intent alignment (does it answer what the user actually wants?)
- 20% Content quality (clarity, repetition, specificity)
- 15% Internal linking (relevant, well-placed, not excessive)
- 10% Authority signals (experience, specificity, credibility)

DO NOT penalise: missing irrelevant sections (staking, earn, etc.), lack of generic "feature coverage"
ONLY penalise missing content if it directly impacts user decision-making, conversion, or major search intent gaps.

INTERNAL LINKING RULES:
- At least 1 link in first 2–3 paragraphs?
- Links placed at decision points (fees, comparisons, KYC)?
- Key competitor pages linked (MEXC, WEEX, etc.)?
- Target = 6–10 high-quality links total
- Only recommend links that keep users on-site or answer the next logical question
- Do NOT flag "too many links" unless the page exceeds 10+ links or links are irrelevant

CONTENT RULES:
- Identify: repetition, weak/generic sections, missing objection handling, missing decision clarity
- Do NOT recommend: adding fluff sections, expanding content for length

ALWAYS CHECK:
1. Does the intro match search intent?
2. Is there a clear verdict early?
3. Are competitor objections handled?
4. Is there a strong "Our Experience" section?
5. Are CTAs placed early AND late?
6. Is there duplicate or low-quality content?
7. Are internal links strategically placed?

OUTPUT FORMAT (use exactly these headings — no deviation):

### Score

[score] / 100

### 🎯 Top 3 Priority Actions

1. ...
2. ...
3. ...

### ⚔️ Key Weaknesses

- ...
- ...

### ✂️ Compression Opportunities

- ...
- ...

### 🔗 Internal Linking Gaps

- ...
- ...

HARD RULES:
- NO generic SEO advice
- NO "add more content" unless critical
- NO recommending irrelevant features (staking, earn, etc.)
- Be direct, blunt, and specific — no filler language, no SEO theory
- Every suggestion must directly improve ranking potential or conversion rate

---

ARTICLE:
${articleContent}

SITE PAGES (for internal link suggestions):
${siteUrls || 'None available'}`,
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
    return new Response(JSON.stringify({ error: error.message ?? 'Analysis failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
