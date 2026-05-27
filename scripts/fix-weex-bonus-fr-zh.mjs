/**
 * Patch the FR and zh-CN WEEX translations: the welcome-bonus line uses
 * "500 USDT" without the $ prefix, so the previous "$500 USDT" replacement
 * missed it. "500,000 USDT" (withdrawal limit) contains a comma between
 * the digits, so a literal "500 USDT" replace can't hit it.
 *
 * Run with: node --env-file=.env.local scripts/fix-weex-bonus-fr-zh.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const targets = ['fr', 'zh-CN']

for (const locale of targets) {
  const [row] = await sql`SELECT id, content FROM article_translations WHERE article_slug = 'weex-review' AND locale = ${locale} LIMIT 1`
  if (!row) {
    console.log(`[${locale}] not found, skipping`)
    continue
  }
  const before = row.content.split('500 USDT').length - 1
  // Sanity check — no literal "500 USDT" substring inside "500,000 USDT" (comma breaks it)
  await sql`
    UPDATE article_translations
    SET content = REPLACE(content, '500 USDT', '10,000 USDT')
    WHERE id = ${row.id}
  `
  const [after] = await sql`SELECT content FROM article_translations WHERE id = ${row.id}`
  const remaining = after.content.split('500 USDT').length - 1
  console.log(`[${locale}] replaced ${before} occurrence(s); remaining: ${remaining}`)
}
