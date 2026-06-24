// Article templates for the SEO content generator.
//
// The exchange-review flow keeps its original prompts inline in the routes
// (unchanged). These helpers add GENERIC, educational article types — explainers,
// coin guides, how-tos, comparisons, listicles — that produce decision-neutral,
// informational content with at most ONE soft contextual CTA.

export type ArticleType =
  | 'exchange_review'
  | 'explainer'
  | 'coin_guide'
  | 'how_to'
  | 'comparison'
  | 'listicle'

export const ARTICLE_TYPES: {
  value: ArticleType
  label: string
  intent: string
  categorySlug: string
  keywordPlaceholder: string
}[] = [
  { value: 'exchange_review', label: 'Exchange Review',      intent: 'review',        categorySlug: 'reviews',     keywordPlaceholder: 'e.g. bingx review' },
  { value: 'explainer',       label: 'Explainer / What-is',  intent: 'informational', categorySlug: 'guides',      keywordPlaceholder: 'e.g. what is staking' },
  { value: 'coin_guide',      label: 'Coin / Token Guide',   intent: 'informational', categorySlug: 'guides',      keywordPlaceholder: 'e.g. solana guide' },
  { value: 'how_to',          label: 'How-To / Tutorial',    intent: 'informational', categorySlug: 'guides',      keywordPlaceholder: 'e.g. how to bridge to Base' },
  { value: 'comparison',      label: 'Comparison',           intent: 'comparison',    categorySlug: 'comparisons', keywordPlaceholder: 'e.g. proof of work vs proof of stake' },
  { value: 'listicle',        label: 'Listicle / Roundup',   intent: 'informational', categorySlug: 'guides',      keywordPlaceholder: 'e.g. best layer 2 networks' },
]

const GENERIC: ArticleType[] = ['explainer', 'coin_guide', 'how_to', 'comparison', 'listicle']

export function isGeneric(type: string | null | undefined): boolean {
  return GENERIC.includes(type as ArticleType)
}

export function articleTypeLabel(type: string): string {
  return ARTICLE_TYPES.find((t) => t.value === type)?.label ?? 'Article'
}

// Per-type section flows, shared by the outline and content prompts.
const STRUCTURES: Record<string, string> = {
  explainer: `- Quick answer: a 1–2 sentence plain-English definition, up top
- What it is: expand the definition with the essentials
- How it works: the mechanics, simply explained (an analogy if it helps)
- Why it matters / where it's used: real use cases
- Key things to know: benefits, trade-offs and risks
- Common misconceptions (if relevant)
- FAQ: 3–5 real questions people ask
- Conclusion: short recap`,
  coin_guide: `- Quick take: what the coin/token is, in one or two sentences
- What is [asset]: background and the problem it solves
- How it works: technology / consensus / what's distinctive
- Use cases & ecosystem: what it's actually used for
- Tokenomics: supply, issuance, utility (only state facts you're sure of)
- How to buy it: a brief practical note (natural spot for a soft CTA)
- Risks & considerations: volatility, competition, regulation
- FAQ: 3–5 questions
- Conclusion`,
  how_to: `- Quick answer: what the reader will achieve and roughly how
- Before you start: prerequisites / what you'll need
- Step-by-step: clear NUMBERED steps (the core of the article)
- Tips & common mistakes
- Troubleshooting (if relevant)
- FAQ: 3–5 questions
- Conclusion`,
  comparison: `- Quick verdict: which option suits which reader (no hard sell)
- What each option is: brief definition of both
- Head-to-head: a comparison table of the key dimensions
- Key differences explained: what the table means in practice
- Which to choose, and when
- FAQ: 3–5 questions
- Conclusion`,
  listicle: `- Intro: the topic + how entries were chosen (selection criteria)
- The list: a short overview table, then one concise section per item
- Per item: what it is, who it's for, the standout point, any caveat
- How to choose between them
- FAQ: 3–5 questions
- Conclusion`,
}

const LINK_RULES = `LINKING RULES:
- Never wrap links in bold. Write [text](url) — NEVER **[text](url)**. Every link, no exception.
- Do NOT add internal links during generation — a later step inserts real, verified URLs. Any internal link added now will 404, so leave internal references as plain text.
- The site is trading365.org only (never trading365.com). Never use absolute https://trading365.org/... URLs for internal references.`

const FORMATTING_RULES = `FORMATTING RULES (MANDATORY — THE RENDERER WILL BREAK IF VIOLATED):
- Your VERY FIRST line of output must be exactly: TITLE: [a compelling, SEO-optimized page title]
- After the TITLE line, leave one blank line, then begin the body with the first "## " section heading
- NEVER include the title inside the body itself — it is extracted separately
- NEVER include excerpt, author, publish/updated date or read time inside the body
- Do NOT add "Last updated:" or "Reviewed by:" lines, and never invent reviewer names, bylines or credentials
- The current year is 2026 — do not reference 2025 as current
- Put ONE blank line before and after every heading, table, list block and --- separator
- All markdown tables MUST have a header row and a separator row (| --- | --- |); every row the same column count
- Use - for all bullet lists; never collapse two markdown elements onto one line
- Never output duplicate words ("read read", "Updated Updated")`

export function genericOutlinePrompt(
  type: string,
  opts: { keyword: string; intent: string; weaknesses?: string },
): string {
  const label = articleTypeLabel(type)
  const structure = STRUCTURES[type] ?? STRUCTURES.explainer
  return `You are an SEO content strategist for a crypto education site (Trading365).

Create a LEAN, scannable outline for an ${label} article that can win the SERP for an informational query. Optimise for clarity and genuine usefulness, not length.

RULES:
- Match the search intent; lead with the answer
- Keep it tight — combine or drop sections that don't serve the topic
- No filler, no generic blog padding
- Always include an FAQ section

SUGGESTED FLOW for a ${label} (adapt to the actual topic):
${structure}

OUTPUT: a clean markdown outline (## headings with bullet sub-points). No commentary.

KEYWORD:
${opts.keyword}

INTENT:
${opts.intent}

NOTES / ANGLES TO COVER:
${opts.weaknesses ?? ''}`
}

export function genericContentPrompt(
  type: string,
  opts: {
    keyword: string
    intent: string
    outline: string
    affiliateLink?: string | null
    affiliateLinks?: { name: string; affiliate_url: string }[]
  },
): string {
  const label = articleTypeLabel(type)
  const structure = STRUCTURES[type] ?? STRUCTURES.explainer
  const allowlist = opts.affiliateLinks?.length
    ? `REFERRAL LINK ALLOWLIST — if you add a referral link, use ONLY these exact URLs. Never invent or guess one. If an exchange isn't listed, don't link it:\n${opts.affiliateLinks
        .map((a) => `- ${a.name}: ${a.affiliate_url}`)
        .join('\n')}`
    : ''
  const cta = opts.affiliateLink
    ? `A CTA link is available: ${opts.affiliateLink}. Include AT MOST ONE gentle, contextual call-to-action with it — only where it genuinely fits (e.g. a "how to buy" step or the conclusion). Phrase it as a helpful next step, not a sales pitch.`
    : `No CTA link provided — keep this purely educational. Do not add any affiliate CTA.`

  return `${LINK_RULES}

You are an expert crypto educator writing for Trading365.

This is an EDUCATIONAL ${label} article for an INFORMATIONAL query. It is NOT an exchange review or a sales page. Be the clearest, most accurate, genuinely useful answer on the web for this topic — good enough that the reader doesn't need to look elsewhere.

PRINCIPLES (E-E-A-T):
- Lead with the answer. The reader should get the gist in the first 2–3 sentences.
- Explain like an expert teaching a smart beginner: plain language, concrete examples, analogies where they help.
- Be accurate and specific. Do NOT fabricate statistics, prices, dates or quotes. If a number isn't certain, speak in general terms.
- Be balanced — cover benefits AND risks/trade-offs honestly.
- No hype, no filler, no generic phrases ("revolutionary", "game-changing", "user-friendly").

STRUCTURE (adapt to the topic — drop or add sections as needed; always include an FAQ):
${structure}

SOFT MONETISATION:
- ${cta}
- This is not a money page: never make the CTA the focus, and never add more than one.

${FORMATTING_RULES}

${allowlist}

KEYWORD: ${opts.keyword}
SEARCH INTENT: ${opts.intent || 'Informational'}

OUTLINE TO FOLLOW:
${opts.outline}

Output a complete, publish-ready article. No commentary, no preamble — only the article.`
}
