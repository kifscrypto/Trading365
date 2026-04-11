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

    const weaknessList = Array.isArray(weaknesses)
      ? (weaknesses as string[]).join('\n')
      : weaknesses

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a content strategist.

Your job is to create a STRUCTURE that beats current SERP results.

You must:
- adapt to search intent
- remove unnecessary sections
- prioritize decision-making flow

DO NOT:
- use generic blog structures
- force full templates
- add filler sections

STRICT RULES:
- Keep structure lean
- Combine sections where possible
- Focus on what helps the user decide

OUTPUT FORMAT:

## Recommended Article Structure

1. **Verdict**
   - 1 paragraph max
   - Clear decision

2. **Introduction**
   - What it is
   - Who it's for
   - Key differentiator

3. **Our Experience**
   - Real usage
   - Friction points
   - Who it suits

4. **Core Sections**
   - Only include what matters
   - Combine where possible

5. **Comparison**
   - Direct vs competitors

6. **Final Verdict**
   - Reinforce decision

---

KEYWORD:
${keyword}

INTENT:
${intent}

WEAKNESSES:
${weaknessList}`,
      }],
    })

    const outline = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ outline })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Outline generation failed' }, { status: 500 })
  }
}
