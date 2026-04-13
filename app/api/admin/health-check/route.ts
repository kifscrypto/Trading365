import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 120

function extractJson(raw: string): string {
  // Strip markdown fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  return raw.trim()
}

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
        messages: [{
          role: 'user',
          content: `You are an HTML content auditor. Audit the HTML article below for errors.

Find all issues across these categories:
- BROKEN_LINK: any <a> tag where href is empty, "#", "javascript:", missing https://, contains spaces, or is placeholder text like "LINK_HERE", "INSERT_LINK", "example.com"
- RAW_MARKDOWN: unprocessed markdown visible as plain text — **text**, *text*, [text](url) syntax, ## heading lines, bare "- item" bullets not inside ul/li
- PLACEHOLDER: placeholder text such as [Exchange Name], [INSERT LINK], "your link here", "click here", "TODO:", "FIXME:", example.com domains
- EMPTY_ELEMENT: empty p, li, td, th, or heading tags with no text content
- HTML_ERROR: raw unescaped < or > not part of a tag, visibly broken tags, markdown fences visible in output

Scoring: start at 100, subtract 15 per error-severity issue, subtract 5 per warning-severity issue, floor at 0.

IMPORTANT: Output ONLY a raw JSON object. No markdown fences. No explanation. No text before or after. Start your response with { and end with }.

Required format:
{"issues":[{"type":"BROKEN_LINK","description":"...","severity":"error","snippet":"..."}],"score":85}

If no issues: {"issues":[],"score":100}

CONTENT TO AUDIT:
${truncated}`,
        }],
      })

      const raw = extractJson(message.content[0].type === 'text' ? message.content[0].text : '')

      // Find the outermost JSON object
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start === -1 || end === -1) {
        return NextResponse.json({ error: 'No JSON object in scan result', raw: raw.slice(0, 300) }, { status: 500 })
      }

      let result: { issues: any[]; score: number }
      try {
        result = JSON.parse(raw.slice(start, end + 1))
      } catch {
        return NextResponse.json({ error: 'Could not parse scan result', raw: raw.slice(0, 300) }, { status: 500 })
      }

      const issues = result.issues ?? []
      const score = result.score ?? Math.max(0, 100 - issues.filter((i: any) => i.severity === 'error').length * 15 - issues.filter((i: any) => i.severity === 'warning').length * 5)

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
      messages: [{
        role: 'user',
        content: `You are an HTML content fixer. Fix the issues listed below in the HTML content.

ISSUES TO FIX:
${issuesList}

Return find-replace patches as a JSON array. Each patch: {"find":"exact verbatim text from HTML","replace":"corrected text"}

Rules:
- "find" must be exact verbatim text from the HTML (15–120 chars, unique in content)
- Minimum change only — never rewrite whole paragraphs
- Broken links with unknown correct URL: remove the <a> tag, keep the link text as plain text
- Raw markdown: convert to HTML (** → <strong>, * → <em>, [text](url) → <a href="url">text</a>, ## heading → <h2>heading</h2>)
- Placeholder text: remove entirely
- Empty elements: remove the tag
- Max 20 patches
- Never add fake reviewer names, bylines, or "Last updated:" lines
- Current year is 2026

IMPORTANT: Output ONLY a raw JSON array. No markdown fences. No explanation. Start with [ and end with ].

HTML CONTENT:
${truncated}`,
      }],
    })

    const raw = extractJson(message.content[0].type === 'text' ? message.content[0].text : '')

    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'No JSON array in fix response', raw: raw.slice(0, 300) }, { status: 500 })
    }

    let patches: { find: string; replace: string }[]
    try {
      patches = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Could not parse fix patches', raw: raw.slice(0, 300) }, { status: 500 })
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
