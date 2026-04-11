import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

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
    const { keyword, intent, weaknesses } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a crypto content strategist building an article outline designed to beat the current Google rankings.

Keyword: "${keyword}"
Intent: ${intent}

Weaknesses in current top-ranking pages to exploit:
${(weaknesses as string[]).map((w, i) => `${i + 1}. ${w}`).join('\n')}

Create a tight, specific article outline that:
1. Matches the intent — review articles lead with verdict, comparison articles lead with the direct contrast, informational leads with the answer
2. Has a section that directly addresses each major weakness above
3. Prioritises decision-making flow — every section moves the reader toward a decision
4. Contains NO padding sections — every section must earn its place
5. Reads like it was built by someone who knows the topic, not a content brief template

Format: numbered sections with sub-points where needed. Add a 1-sentence note under each section explaining what it must accomplish.

REFERENCE STRUCTURES (adapt — do not copy blindly):
- Review intent: Verdict → What it is → Our Testing Experience → Fees / KYC / Risk (combined if similar weight) → How it compares → Final Call
- Comparison intent: Verdict → Head-to-head breakdown → Key differences that actually matter → When to use each → Our pick and why
- Informational intent: The direct answer → Why it matters → How it works (with specifics) → What to watch out for → Bottom line

DO NOT:
- Add FAQ sections just to add FAQs
- Include generic "About [Exchange]" or "History" sections unless they're essential
- Force any template — the structure must serve this specific keyword`,
      }],
    })

    const outline = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ outline })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Outline generation failed' }, { status: 500 })
  }
}
