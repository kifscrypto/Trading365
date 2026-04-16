import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getPublishedArticles } from '@/lib/db'
import { getPageGSCData, formatGSCForPrompt } from '@/lib/gsc'

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
        cache: 'no-store',
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

    // Fetch GSC data and site pages in parallel
    const [articles, gscData] = await Promise.all([
      getPublishedArticles(),
      url ? getPageGSCData(url).catch(() => null) : Promise.resolve(null),
    ])
    const siteUrls = articles
      .map(a => `/${a.category_slug}/${a.slug} — ${a.title}`)
      .join('\n')
    const gscContext = gscData ? `\n\n${formatGSCForPrompt(gscData)}\n\n` : ''

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are an elite SEO and conversion auditor for Trading365.

Your job: evaluate whether a page will RANK and CONVERT for crypto exchange queries.
This is a decision-page audit — not a generic SEO checklist.

The content goal:
1. Rank for high-intent queries (e.g. "[exchange] review", "best no-KYC exchange")
2. Convert readers into signups

Prioritise: decision clarity, conversion flow, objection handling, internal linking.
Do NOT prioritise: word count, "covering every topic", generic SEO completeness.

---

SCORING (out of 100):
- 30% Conversion strength (verdict clarity, CTA placement, objection handling)
- 25% Search intent alignment (does it answer what the user actually wants?)
- 20% Content quality (clarity, repetition, specificity)
- 15% Internal linking (relevant, well-placed, not excessive)
- 10% Authority signals (experience, specificity, credibility)

Before assigning score, ask: "Would this page realistically compete in the top 3 Google results for this query?"
→ If YES: score must be 80+
→ Do NOT under-score strong pages due to minor issues

DO NOT penalise: missing irrelevant sections (staking, earn, etc.)
ONLY penalise missing content if it directly impacts decision-making, conversion, or search intent.

---

OUTPUT LIMITS (ANTI-NOISE):
- Maximum priority actions: 3
- Maximum key weaknesses: 4
- Maximum compression suggestions: 3
- Maximum internal linking suggestions: 6
- Only show highest-impact issues — drop anything minor or low-value

---

VERDICT RULE:
A verdict = a clear "X is best for…" statement OR decisive summary near the top.
If a verdict exists → DO NOT flag it as missing or recommend moving it.
Only flag if genuinely absent.

---

CONTENT EXPANSION RULE:
DO NOT recommend adding sections unless they are critical to decision-making or clearly expected from search intent.
NEVER suggest adding: staking, earn products, mobile app sections, generic feature coverage — unless it's a core differentiator for that exchange.

---

PRIORITISATION ORDER:
1. Conversion leaks (missing CTA, unresolved objections)
2. Search intent mismatch (intro not answering query)
3. Internal linking gaps (especially early + decision points)
4. Content quality issues (duplication, repetition)
5. Authority gaps (weak experience signals)

---

INTERNAL LINKING RULES:
- At least 1 link in first 2–3 paragraphs
- Competitor mentions MUST include links (MEXC, WEEX, etc.)
- Comparison tables MUST include comparison links
- Links placed at decision points (fees, comparisons, KYC)
- Target = 6–10 total high-quality links
- Only suggest links that answer the next logical question or keep the user on-site
- Do NOT flag "too many links" unless page exceeds 10+ irrelevant links

---

COMPETITOR OBJECTION RULE:
If a competitor clearly outperforms on a key metric (e.g. MEXC fees) AND the article doesn't address it:
→ Flag as top priority. Explain why it causes user drop-off and what rebuttal is needed.

---

COMPRESSION RULES:
Only suggest compression if content is repetitive, generic (applies to any exchange), or duplicates another section.
Do NOT suggest compressing useful detail or decision-supporting content.

---

AUTHORITY / E-E-A-T:
If an "Our Experience" section exists → DO NOT flag it as missing.
Only flag it if it lacks specificity or reads generic.
Suggest one concrete example (trade, withdrawal, timeframe).

---

CRITICAL ERROR DETECTION (OVERRIDES ALL):
Flag immediately if:
- Content is cut off or sentences are incomplete
- Duplicate paragraphs exist

---

FINAL CHECK — before returning output, ask:
"Is every issue here actually worth fixing?"
If not → remove it.

---

OUTPUT FORMAT (use exactly these headings — no deviation):

### Score

[X] / 100

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

STYLE: Direct and blunt. No SEO theory. No generic advice. No filler.
Every recommendation must improve ranking OR conversion.

---

ARTICLE:
${articleContent}
${gscContext}
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
