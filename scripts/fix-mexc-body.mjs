/**
 * Strips the "Key Facts" and "Ratings" sections from the MEXC article body.
 * Keeps everything from the "Fees" heading onwards.
 * Run with: node --env-file=.env.local scripts/fix-mexc-body.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const rows = await sql`SELECT id, content FROM articles WHERE slug = 'mexc-review' LIMIT 1`
if (!rows.length) { console.error('mexc-review not found'); process.exit(1) }

const { id, content } = rows[0]

// Find the Fees heading — everything from here onwards is the real body
const feesIndex = content.search(/<h2[^>]*>[^<]*[Ff]ees/i)

if (feesIndex === -1) {
  console.error('Could not find Fees heading in content')
  console.log('Content preview:', content.slice(0, 500))
  process.exit(1)
}

const cleaned = content.slice(feesIndex).trim()

await sql`UPDATE articles SET content = ${cleaned}, updated_at = NOW() WHERE id = ${id}`

console.log(`Done. Removed ${content.length - cleaned.length} characters (Key Facts + Ratings sections) from mexc-review.`)
