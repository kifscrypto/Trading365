import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { scrapeSerp } from '@/lib/seo/scraper'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export const maxDuration = 30

export async function POST(request: Request) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { keyword } = await request.json()
    if (!keyword?.trim()) return NextResponse.json({ error: 'Keyword required' }, { status: 400 })

    const serpResults = await scrapeSerp(keyword.trim())
    const hasSerpData = serpResults.length > 0

    const serpContext = hasSerpData
      ? serpResults.map((r) =>
          `${r.position}. "${r.title}"\n   URL: ${r.url}\n   Snippet: ${r.snippet || 'n/a'}`
        ).join('\n\n')
      : `No live SERP data retrieved. Use your training knowledge of what typically ranks for crypto exchange content related to "${keyword}".`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a crypto content strategist. Analyze the Google SERP for the keyword: "${keyword}"

${hasSerpData ? 'Live SERP data:' : 'Note: No live data — apply your knowledge of crypto exchange SERPs.'}
${serpContext}

Return ONLY valid JSON (no markdown wrapper, no explanation) with exactly this structure:
{
  "intent": "review | comparison | informational | hybrid",
  "what_google_rewards": "2-3 plain English sentences. What pattern do the ranking pages share? Why does Google reward them for this keyword?",
  "weaknesses": [
    "Specific, actionable weakness 1 — not generic",
    "Specific, actionable weakness 2",
    "Specific, actionable weakness 3",
    "Specific, actionable weakness 4",
    "Specific, actionable weakness 5",
    "Specific, actionable weakness 6"
  ],
  "content_patterns": {
    "dominant_type": "review | comparison | guide | mixed",
    "typical_length": "short (under 1000w) | medium (1000-3000w) | long (3000w+)",
    "common_sections": ["array", "of", "heading", "types", "seen"]
  }
}

Weaknesses must be:
- Specific to crypto exchange content (reference fees, KYC requirements, leverage, spreads, UI, security, withdrawal speed, etc.)
- Actionable — each one should imply a clear opportunity to do better
- NOT generic ("content is thin" or "needs more detail" is not acceptable)
- Written as a clear observation, e.g. "No section covering actual withdrawal experience — all fee data is from the exchange's own marketing"`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude did not return valid JSON')
    const analysis = JSON.parse(jsonMatch[0])

    return NextResponse.json({ keyword, serpResults, hasSerpData, ...analysis })
  } catch (error: any) {
    console.error('SEO analyze error:', error)
    return NextResponse.json({ error: error.message ?? 'Analysis failed' }, { status: 500 })
  }
}
