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
    const truncated = content.slice(0, 22000)

    // ── SCAN MODE ──────────────────────────────────────────────────────────────
    if (mode === 'scan') {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Audit this HTML article content for formatting and link errors.

Find issues in these categories:

1. BROKEN_LINK — <a> tags with: empty href, href="#", href="javascript:", missing https:// protocol, URLs with spaces, placeholder URLs like "LINK_HERE", "INSERT_LINK", "your-link", "example.com". Also bare URLs in text that are not wrapped in <a> tags.
2. RAW_MARKDOWN — unprocessed markdown visible as plain text in the HTML: **text**, *text*, [text](url) link syntax, ## heading lines, "- item" or "* item" bullet lines that are not inside <ul>/<li> tags
3. PLACEHOLDER — placeholder text: "[Exchange Name]", "[INSERT LINK]", "your link here", "click here", "TODO:", "FIXME:", dummy domains like example.com
4. EMPTY_ELEMENT — empty <p>, <li>, <td>, <th>, or heading tags with no text content
5. HTML_ERROR — raw unescaped < or > characters not part of a tag, visibly broken/unclosed HTML tags, markdown fences (\`\`\`) visible in output

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "issues": [
    {
      "type": "BROKEN_LINK" | "RAW_MARKDOWN" | "PLACEHOLDER" | "EMPTY_ELEMENT" | "HTML_ERROR",
      "description": "concise description of the problem",
      "severity": "error" | "warning",
      "snippet": "relevant excerpt from the HTML, max 80 chars"
    }
  ],
  "score": 0-100
}

Scoring: start at 100. Deduct 15 per "error" severity issue. Deduct 5 per "warning" severity issue. Minimum 0.
If no issues found, return: { "issues": [], "score": 100 }

CONTENT TO AUDIT:
${truncated}`,
        }],
      })

      const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return NextResponse.json({ error: 'Could not parse scan result', raw }, { status: 500 })
      }

      try {
        const result = JSON.parse(jsonMatch[0])
        return NextResponse.json({ issues: result.issues ?? [], score: result.score ?? 100 })
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in scan result' }, { status: 500 })
      }
    }

    // ── FIX MODE ───────────────────────────────────────────────────────────────
    const issuesList = incomingIssues?.length
      ? incomingIssues
          .map((iss: any, i: number) =>
            `${i + 1}. [${iss.type}] ${iss.description}${iss.snippet ? ` — near: "${iss.snippet}"` : ''}`
          )
          .join('\n')
      : 'Fix all broken links, raw markdown syntax, placeholder text, and empty elements found in the content'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Fix formatting and link errors in this HTML article content.

ISSUES TO FIX:
${issuesList}

Return a JSON array of find-replace patches. Each patch:
{ "find": "exact verbatim text from the HTML", "replace": "corrected replacement" }

RULES:
- Return ONLY a valid JSON array — no markdown fences, no explanation
- "find" must be verbatim text copied exactly from the HTML (15–120 chars, must be unique in the content)
- Make the minimum change needed — never rewrite whole paragraphs
- Broken links where you cannot determine the real URL: remove the <a> wrapper, leave the link text as plain text
- Raw markdown: convert to proper HTML (** → <strong>, * → <em>, [text](url) → <a href="url">text</a>, ## heading → <h2>heading</h2>, - item → <li>item</li>)
- Placeholder text: remove the placeholder or replace with empty string as appropriate
- Empty elements: remove the element tag entirely
- Maximum 20 patches
- NEVER introduce fake reviewer names, bylines, credentials, or "Last updated:" / "Reviewed by:" lines
- Current year is 2026 — never introduce 2025 as the current year

HTML CONTENT:
${truncated}`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse fix patches', raw }, { status: 500 })
    }

    let patches: { find: string; replace: string }[]
    try {
      patches = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in fix patches' }, { status: 500 })
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
