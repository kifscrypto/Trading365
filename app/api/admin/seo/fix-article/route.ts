import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getArticleById } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 120

function extractJsonArray(raw: string): string {
  // Strip markdown fences if Claude wraps output
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Slice from first [ to last ] to handle any preamble/postamble
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1)
  return raw.trim()
}

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, url, articleId, fix } = await request.json()

    if (!fix?.trim()) {
      return NextResponse.json({ error: 'Fix instruction required' }, { status: 400 })
    }

    let articleContent = ''

    if (articleId) {
      const article = await getArticleById(parseInt(articleId))
      if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 })
      articleContent = article.content
    } else if (content?.trim()) {
      articleContent = content.trim()
    } else if (url) {
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
        .slice(0, 15000)
    }

    if (!articleContent) {
      return NextResponse.json({ error: 'No article content to fix' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const truncatedContent = articleContent.slice(0, 18000)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'You output only a valid JSON array of find-replace patches. No explanation, no markdown fences, no preamble. Output starts with [ and ends with ].',
      messages: [{
        role: 'user',
        content: `Apply these fixes to the article below.

FIXES TO APPLY:
${fix}

Return a JSON array where each element is:
{ "find": "exact verbatim text from article", "replace": "replacement text" }

RULES:
- "find" must be verbatim text copied exactly from the article (15–80 chars, distinctive)
- Avoid quoting text that appears more than once
- Make the minimum change needed — don't rewrite whole paragraphs for a one-line fix
- For insertions: include the line/heading just before the insert point in "find", then put that line + new content in "replace"
- Maximum 20 patches
- NEVER introduce fake reviewer names, bylines, credentials, or "Last updated:" / "Reviewed by:" lines
- The current year is 2026 — do not introduce 2025 as current in any replacement text
- Referral/affiliate link text must never be bold — use plain [text](url) not **[text](url)**

ARTICLE:
${truncatedContent}`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = extractJsonArray(raw)

    let patches: { find: string; replace: string }[]
    try {
      patches = JSON.parse(cleaned)
    } catch {
      // Salvage truncated JSON by closing the array
      try {
        const salvaged = cleaned.replace(/,\s*$/, '') + ']'
        patches = JSON.parse(salvaged)
      } catch {
        return NextResponse.json({ error: 'Could not parse patches from response', raw: raw.slice(0, 400) }, { status: 500 })
      }
    }

    // Apply patches to original article
    let patched = articleContent
    const results: { find: string; applied: boolean }[] = []

    for (const { find, replace } of patches) {
      if (typeof find !== 'string' || typeof replace !== 'string') continue
      if (patched.includes(find)) {
        patched = patched.replace(find, replace)
        results.push({ find, applied: true })
      } else {
        results.push({ find, applied: false })
      }
    }

    const applied = results.filter(r => r.applied).length
    const failed = results.filter(r => !r.applied).length

    return NextResponse.json({ content: patched, applied, failed, total: patches.length })
  } catch (error: any) {
    console.error('fix-article error:', error)
    return NextResponse.json({ error: error.message ?? 'Fix failed' }, { status: 500 })
  }
}
