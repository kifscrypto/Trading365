/**
 * Diagnostic: show slug + thumbnail for all articles
 * Run with: node --env-file=.env.local scripts/check-thumbnails.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const rows = await sql`SELECT id, slug, thumbnail FROM articles ORDER BY created_at DESC`

console.table(rows.map(r => ({ id: r.id, slug: r.slug, thumbnail: r.thumbnail ?? '(null)' })))
