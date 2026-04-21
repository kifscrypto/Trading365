import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { content, instructions, keyword, affiliateLink, affiliateLinks } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const affiliateListBlock = affiliateLinks?.length
      ? `REFERRAL LINK ALLOWLIST — use ONLY these exact URLs for any referral or affiliate links. Never invent, guess, or substitute other URLs:\n${affiliateLinks.map((a: { name: string; affiliate_url: string }) => `- ${a.name}: ${a.affiliate_url}`).join('\n')}\nIf an exchange is not in this list, do not add a referral link for it.`
      : ''

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: `You are an article editor. Your output IS the article — nothing else.

ABSOLUTE OUTPUT RULE: The very first character you output must be the first character of the article (the # in ## Verdict). Do not write "Here is the updated article", "I've made the following changes", "Done", or any other preamble or postamble. Zero commentary. Zero acknowledgment. The output is the article and only the article. If you add even one word of commentary, the output is corrupted.`,
      messages: [{
        role: 'user',
        content: `MAKE THIS CHANGE TO THE ARTICLE:
${instructions}

EXECUTION RULES:
- Execute the instruction completely — if asked to add a section, write the full section with proper headings and content
- Preserve all existing content and wording exactly unless the instruction requires changing it
- Do not skip, abbreviate, or summarise the existing article — output it in full with the change applied
- Never bold link text — use plain [text](url) only

LINK RULES:
- Do NOT add internal links — a separate step inserts verified URLs. Any internal link you add will 404.
- NEVER use trading365.com — the site is trading365.org only. Never use absolute URLs — relative paths only.
${affiliateListBlock}

FORMATTING (do not break):
- Article body begins with ## Verdict — no title, no author, no date before it
- ONE blank line before and after every heading, table, list block, and --- separator
- Never place --- and ## on adjacent lines without a blank line between
- All markdown tables must have a header row and a separator row (| --- | --- |)
- Never output duplicate words or phrases

KEYWORD: ${keyword ?? ''}
${affiliateLink ? `CTA LINK: ${affiliateLink} — use this exact URL for all clickable CTAs.` : ''}

ARTICLE:
${content}`,
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
    return new Response(JSON.stringify({ error: error.message ?? 'Refinement failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
