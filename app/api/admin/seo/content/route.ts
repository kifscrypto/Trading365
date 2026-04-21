import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

export async function POST(request: Request) {
  const cookieStore = await cookies()
  if (!cookieStore.get('admin_auth')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { keyword, outline, intent, affiliateLink } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `CRITICAL: Never wrap links in bold. Write [text](url) — NEVER **[text](url)**. This applies to every single link in the article without exception.

You are an elite crypto SEO content writer for Trading365.

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
- Do NOT add any internal links during generation
- A dedicated linking step will insert real, verified URLs after generation
- Adding internal links now will cause 404s — leave all internal references as plain text only
- NEVER use trading365.com — the site is trading365.org only. trading365.com does not exist.
- NEVER use absolute URLs like https://trading365.org/... — all internal links must be relative paths like /reviews/slug

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
- In ALL markdown tables, exchange names in the first column MUST be linked to their referral URL using [Name](url) — never plain text. This applies without exception.
- NO fluff sections (staking, earn, etc.) unless it's a core differentiator
- NO repeating the same idea multiple times
- NO padding for word count
- NO fake reviewer names, bylines, or credentials — never invent people
- NO "Last updated:" or "Reviewed by:" lines — do not add them under any circumstances
- The current year is 2026 — do not reference 2025 as current or recent
- Referral/affiliate links must NEVER be bold — use plain [text](url) not **[text](url)**

FORMATTING RULES (MANDATORY — RENDERER WILL BREAK IF VIOLATED):
- Your VERY FIRST line of output must be exactly: TITLE: [write a compelling, SEO-optimized page title for this article]
- After the TITLE line, leave one blank line, then begin the article body with ## Verdict
- NEVER include the title inside the article body itself — it is extracted separately
- NEVER include the article excerpt, author name, publish date, updated date, or read time inside the body — these are separate fields
- NEVER include pros/cons lists labelled "Pros:" or "Cons:" inside the body — these are separate fields
- Put ONE blank line before and after every heading, table, list block, and --- separator
- NEVER write --- and ## on the same line or without a blank line between them
- All markdown tables MUST have a header row and a separator row (| --- | --- |) — no exceptions
- All table rows must have the same number of columns as the header
- NEVER output duplicate words or phrases like "14 min read read" or "Updated Updated"
- Use - for all bullet lists, consistently
- Do NOT collapse two markdown elements onto one line

FINAL CHECK — before output, ask:
"Would this page beat the current top 3 Google results?"
If not → improve clarity and decision-making.

---

## MONEY PAGE MODE (AUTOMATIC — DO NOT SKIP)

This article is a high-intent, revenue-focused page. You must optimise for ranking AND conversion in a single pass.

Apply ALL of the following during generation:

### 1. Immediate Decision (CRITICAL)
- Within the first 120–150 words, clearly answer:
  "What should the user choose?"
- No neutrality. No "it depends."

---

### 2. Real Experience Signals (MANDATORY)
Include at least 3 specific, realistic usage insights:
- Deposit or withdrawal timing
- Execution quality
- Friction (delays, verification, support)

These must feel real, not generic.

---

### 3. Competitor Closure
Whenever a competitor is mentioned:
- Close the loop
- Explain WHY the user should still choose the recommended option

Never leave a competitor as an open alternative.

---

### 4. Honest Friction (E-E-A-T)
Include at least 2 real downsides:
- Regulatory risk
- UX issues
- Hidden costs
- Support delays

Avoid generic statements.

---

### 5. CTA Placement
Include:
- One CTA early (after verdict or first section)
- One CTA at the end

Each must tie to a specific benefit.

---

### 6. Internal Linking (STRUCTURAL)
Do NOT add any internal links. A separate step inserts real verified URLs.
Any internal link added here will 404 — leave all cross-references as plain text.

---

### 7. Compression Discipline
Avoid:
- Step-by-step tutorials
- Generic explanations
- Repetition

Prioritise decision-making content.

---

### 8. Final Output Goal
The article must:
- Help the user decide quickly
- Reduce need to search elsewhere
- Keep user on-site
- Drive toward signup/action

If it does not achieve this, refine BEFORE outputting.

---

Output a complete, publish-ready article. No commentary. No explanation. Only the article.

---

KEYWORD: ${keyword}
SEARCH INTENT: ${intent || 'Not specified'}
${affiliateLink ? `CTA LINK: ${affiliateLink}
Use this exact URL for ALL clickable CTAs ("Start Trading", "Open Account", "Claim Bonus", etc.). Do not invent or substitute other URLs.` : ''}

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
