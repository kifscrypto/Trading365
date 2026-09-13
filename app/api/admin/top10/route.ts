import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { kimiChat, type KimiMessage } from '@/lib/kimi'
import { sql } from '@/lib/db'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

export const maxDuration = 300

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS top10_packages (
      id         SERIAL PRIMARY KEY,
      topic      TEXT NOT NULL,
      item_count INTEGER DEFAULT 10,
      tone       TEXT,
      package    JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

function buildMessages(topic: string, itemCount: number, tone: string): KimiMessage[] {
  return [
    {
      role: 'system',
      content: `You are a TikTok growth strategist for a faceless "Top 10" countdown channel.
You write TikTok-SEO-optimized copy: searchable keywords in the caption, a hashtag mix of
broad + niche tags, scroll-stopping hooks. Return ONLY a JSON object with this exact shape:

{
  "titleOptions": ["4-5 title options for the video"],
  "caption": "SEO-optimized TikTok caption, max 2000 characters, keywords front-loaded",
  "hashtags": ["12-15 tags mixing broad (#top10) and niche (#christmasadverts)"],
  "hooks": ["3-5 opening on-screen hook lines"],
  "items": [{ "rank": 10, "name": "...", "onScreenText": "...", "voiceoverLine": "..." }],
  "coverConcepts": [{ "headline": "...", "subline": "...", "layout": "...", "colors": "..." }],
  "seoKeywords": ["TikTok search phrases people would type"],
  "postingTimes": ["2-3 suggested posting slots with reasoning"]
}

Rules:
- items has exactly ${itemCount} entries, ordered ${itemCount} down to 1 (countdown order).
- coverConcepts are text/layout specs to recreate in CapCut — no image generation.
- Return raw JSON only, no markdown fences, no commentary.`,
    },
    {
      role: 'user',
      content: `Topic: ${topic}
Item count: ${itemCount}
Tone: ${tone}`,
    },
  ]
}

// POST — generate a full TikTok package for a topic and save it.
export async function POST(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { topic, itemCount, tone } = await request.json()
    if (!topic || !String(topic).trim()) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    const count = Math.min(Math.max(Number(itemCount) || 10, 3), 25)
    const toneText = tone || 'punchy, nostalgic'
    const messages = buildMessages(String(topic).trim(), count, toneText)

    let raw = await kimiChat(messages, { maxTokens: 4000, json: true })
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(raw)
    } catch {
      raw = await kimiChat(
        [...messages, { role: 'user', content: 'Return valid JSON only, no markdown fences.' }],
        { maxTokens: 4000, json: true }
      )
      pkg = JSON.parse(raw)
    }

    await ensureTable()
    const rows = await sql`
      INSERT INTO top10_packages (topic, item_count, tone, package)
      VALUES (${String(topic).trim()}, ${count}, ${toneText}, ${JSON.stringify(pkg)})
      RETURNING id
    `
    return NextResponse.json({ id: rows[0].id, package: pkg }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Generation failed' }, { status: 500 })
  }
}

// GET — history list (no JSON blob), or ?id=N for one full package.
export async function GET(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTable()
    const id = new URL(request.url).searchParams.get('id')
    if (id) {
      const rows = await sql`
        SELECT id, topic, item_count, tone, package, created_at
        FROM top10_packages
        WHERE id = ${Number(id)}
        LIMIT 1
      `
      if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(rows[0])
    }
    const rows = await sql`
      SELECT id, topic, item_count, tone, created_at
      FROM top10_packages
      ORDER BY created_at DESC
      LIMIT 50
    `
    return NextResponse.json({ packages: rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE — ?id=N removes a package.
export async function DELETE(request: Request) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureTable()
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await sql`DELETE FROM top10_packages WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
