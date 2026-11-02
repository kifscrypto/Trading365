import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { isOpsAuthorized } from '@/lib/ops-auth'
import { replaceIdea, type ArticleCoverage, type OpsContentItem } from '@/lib/ops-content-planner'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  if (!(await isOpsAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  let id: string
  try {
    const body = await request.json()
    id = body.id
    if (typeof id !== 'string' || !id) throw new Error()
  } catch {
    return NextResponse.json({ error: 'A calendar item id is required' }, { status: 400, headers: NO_STORE })
  }

  try {
    const [contentRows, articles, affiliates] = await Promise.all([
      sql`SELECT data FROM ops_collections WHERE name = 'content'`,
      sql`SELECT title, slug FROM articles`,
      sql`SELECT name FROM affiliate_links ORDER BY name ASC`,
    ])
    const items = contentRows[0]?.data
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Content calendar not found' }, { status: 404, headers: NO_STORE })
    }
    const result = replaceIdea(
      items as OpsContentItem[],
      articles as ArticleCoverage[],
      (affiliates as { name: string }[]).map(affiliate => affiliate.name).filter(Boolean),
      id,
    )
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not replace this idea'
    const status = message === 'No fresh replacement topics are available' ? 409 : 400
    return NextResponse.json({ error: message }, { status, headers: NO_STORE })
  }
}
