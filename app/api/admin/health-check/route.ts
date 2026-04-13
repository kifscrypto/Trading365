import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 120

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, mode = 'scan', issues: incomingIssues } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const truncated = content.slice(0, 20000)

    // ── SCAN MODE ──────────────────────────────────────────────────────────────
    if (mode === 'scan') {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: 'You are an HTML content auditor. You output only valid JSON. Never output markdown fences, explanations, or any text outside the JSON object.',
        messages: [
          {
            role: 'user',
            content: `Audit this HTML article content for errors. Find all issues across these five categories:

BROKEN_LINK: any <a> tag where href is empty, "#", "javascript:", missing the https:// protocol, contains spaces, or is a placeholder like "LINK_HERE", "INSERT_LINK", "your-link", "example.com"
RAW_MARKDOWN: unprocessed markdown visible as plain text — **text**, *text*, [text](url) syntax, ## heading lines, bare "- item" bullet lines not inside ul/li tags
PLACEHOLDER: placeholder text such as [Exchange Name], [INSERT LINK], "your link here", "click here", "TODO:", "FIXME:", or example.com domains
EMPTY_ELEMENT: empty p, li, td, th, or heading tags containing no text
HTML_ERROR: raw unescaped < or > not part of a tag, visibly broken tags, or markdown code fences visible in output

Each issue needs: type (one of the five above), description (concise), severity ("error" or "warning"), snippet (short excerpt showing the problem, max 80 chars).

Scoring: start at 100, subtract 15 per error, subtract 5 per warning, floor at 0.

CONTENT:
${truncated}`,
          },
          {
            role: 'assistant',
            content: '{"issues":[',
          },
        ],
      })

      const partial = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
      const raw = '{"issues":[' + partial

      let result: { issues: any[]; score: number }
      try {
        result = JSON.parse(raw)
      } catch {
        // Try to salvage truncated JSON by closing it
        try {
          const salvaged = raw.replace(/,\s*$/, '') + '],"score":0}'
          result = JSON.parse(salvaged)
        } catch {
          return NextResponse.json({ error: 'Could not parse scan result', raw: raw.slice(0, 500) }, { status: 500 })
        }
      }

      // Recalculate score from actual issues if Claude returned 0 (salvage case)
      const issues = result.issues ?? []
      let score = result.score ?? 100
      if (score === 0 && issues.length === 0) score = 100
      if (score === 0 && issues.length > 0) {
        score = Math.max(0, 100 - issues.filter((i: any) => i.severity === 'error').length * 15 - issues.filter((i: any) => i.severity === 'warning').length * 5)
      }

      return NextResponse.json({ issues, score })
    }

    // ── FIX MODE ───────────────────────────────────────────────────────────────
    const issuesList = incomingIssues?.length
      ? incomingIssues
          .map((iss: any, i: number) =>
            `${i + 1}. [${iss.type}] ${iss.description}${iss.snippet ? ` — near: "${iss.snippet}"` : ''}`
          )
          .join('\n')
      : 'Fix all broken links, raw markdown syntax, placeholder text, and empty elements'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'You are an HTML content fixer. You output only a valid JSON array of find-replace patches. Never output markdown fences, explanations, or any text outside the JSON array.',
      messages: [
        {
          role: 'user',
          content: `Fix these issues in the HTML content below.

ISSUES TO FIX:
${issuesList}

Return a JSON array of find-replace patches. Each patch has "find" (exact verbatim text from the HTML, 15–120 chars, must be unique) and "replace" (corrected replacement).

Rules:
- Minimum change only — never rewrite whole paragraphs
- Broken links with unknown correct URL: remove the a tag, leave the link text as plain text
- Raw markdown: convert to HTML (** to strong, * to em, [text](url) to anchor tag, ## heading to h2, - item to li)
- Placeholder text: remove entirely
- Empty elements: remove the tag
- Max 20 patches
- Never add fake reviewer names, bylines, or "Last updated:" lines
- Current year is 2026

HTML CONTENT:
${truncated}`,
        },
        {
          role: 'assistant',
          content: '[',
        },
      ],
    })

    const partial = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const raw = '[' + partial

    let patches: { find: string; replace: string }[]
    try {
      patches = JSON.parse(raw)
    } catch {
      try {
        const salvaged = raw.replace(/,\s*$/, '') + ']'
        patches = JSON.parse(salvaged)
      } catch {
        return NextResponse.json({ error: 'Could not parse fix patches', raw: raw.slice(0, 500) }, { status: 500 })
      }
    }

    let patched = content
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
    console.error('health-check error:', error)
    return NextResponse.json({ error: error.message ?? 'Health check failed' }, { status: 500 })
  }
}
