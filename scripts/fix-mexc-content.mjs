/**
 * One-time script: strips the admin-notes section from the mexc-review article.
 * The notes were accidentally included after a <hr> tag at the end of the content.
 *
 * Run with:  node --env-file=.env.local scripts/fix-mexc-content.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const rows = await sql`SELECT id, content FROM articles WHERE slug = 'mexc-review' LIMIT 1`

if (!rows.length) {
  console.error('Article mexc-review not found')
  process.exit(1)
}

const { id, content } = rows[0]

// Strip everything from the first <hr> tag onwards (that's where the notes begin)
const hrIndex = content.indexOf('<hr')
if (hrIndex === -1) {
  console.log('No <hr> found in content — nothing to strip')
  process.exit(0)
}

const cleaned = content.slice(0, hrIndex).trim()

await sql`UPDATE articles SET content = ${cleaned}, updated_at = NOW() WHERE id = ${id}`

console.log(`Done. Stripped ${content.length - cleaned.length} characters from mexc-review (article id=${id}).`)
