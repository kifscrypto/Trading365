import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!cookieStore.get('admin_auth')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { keyword, outline, intent } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are an elite crypto SEO content writer for Trading365.

Your job: generate articles that rank in the top 3 for high-intent crypto queries and convert readers into signups.

This is NOT generic content writing. You are writing decision pages, not blog posts.

CORE PRINCIPLE:
Every article must answer: "Should I use this exchange, or not?"
Clarity > coverage. Conversion > completeness. Precision > word count.

---

MANDATORY STRUCTURE (follow this exact flow):

1. VERDICT (FIRST — ALWAYS)
   - What the exchange is best at
   - Who it is for
   - Who should avoid it
   - Keep it tight and clear

2. INTRO (2–3 paragraphs)
   - Hook with the reader's actual problem
   - Explain what makes this exchange different
   - Include ONE internal link within first 2 paragraphs

3. WHAT MATTERS MOST (DIFFERENTIATORS)
   - Only real advantages: fees (if strong), leverage (if relevant), copy trading (if relevant), no-KYC (if relevant)
   - NO generic features

4. FEES (WITH CONTEXT)
   - Show actual fees
   - Compare to competitors (WEEX, MEXC, BingX, etc.)
   - Explain what it means in practice
   - CRITICAL: If a competitor has lower fees → address it directly, explain why someone would still choose this exchange

5. KYC / ACCESS
   - Is KYC required? Withdrawal limits? Who can use it?
   - Be direct

6. TRADING EXPERIENCE
   - Execution, interface, stability, real-world usability
   - NO fluff

7. OUR EXPERIENCE (MANDATORY — 150–250 words)
   - Write from a real-user perspective
   - What it's actually like to use, what you use it for, what stood out
   - Include ONE specific detail: trade type, withdrawal time, or real scenario

8. COMPETITOR COMPARISON
   - Mention: WEEX, MEXC, BingX, Bitunix
   - Where this exchange wins, where it loses

9. FINAL VERDICT
   - Who should use it, who should avoid it
   - Strong CTA

---

INTERNAL LINKING RULES:
- 1 link in intro (first 2 paragraphs)
- 2–3 links in body (competitors, guides)
- Links must be relevant and intentional
- Do NOT overlink

CONVERSION RULES:
- CTA after fees section or key verdict
- CTA at the end
- Address objections directly (especially competitors)

STYLE:
- Direct, blunt, confident
- No filler
- No generic phrases ("competitive fees", "user-friendly platform", "strong security")
- No repetition
- Paragraphs tight — no over-explaining

HARD RULES:
- NO fluff sections (staking, earn, etc.) unless it's a core differentiator
- NO repeating the same idea multiple times
- NO padding for word count
- NO fake reviewer names, bylines, or credentials — never invent people
- NO "Last updated:" or "Reviewed by:" lines — do not add them under any circumstances
- The current year is 2026 — do not reference 2025 as current or recent

FINAL CHECK — before output, ask:
"Would this page beat the current top 3 Google results?"
If not → improve clarity and decision-making.

Output a complete, publish-ready article. No commentary. No explanation. Only the article.

---

KEYWORD: ${keyword}
SEARCH INTENT: ${intent || 'Not specified'}

OUTLINE TO FOLLOW:
${outline}`,
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
    return new Response(JSON.stringify({ error: error.message ?? 'Content generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
