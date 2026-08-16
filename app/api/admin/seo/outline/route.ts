import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { kimiChat } from '@/lib/kimi'
import { isGeneric, genericOutlinePrompt } from '@/lib/seo/templates'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { keyword, intent, weaknesses, articleType } = await request.json()

    const weaknessList = Array.isArray(weaknesses)
      ? (weaknesses as string[]).join('\n')
      : weaknesses

    // Generic (educational) article types use the template prompts; exchange
    // reviews keep the original decision/review outline below.
    const promptContent = isGeneric(articleType)
      ? genericOutlinePrompt(articleType, { keyword, intent, weaknesses: weaknessList })
      : `You are a content strategist.

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
${weaknessList}`

    const outline = await kimiChat([{ role: 'user', content: promptContent }], { maxTokens: 1500 })
    return NextResponse.json({ outline })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Outline generation failed' }, { status: 500 })
  }
}
