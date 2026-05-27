/**
 * Inspect the FR and zh-CN WEEX translations for any "500 USDT" / bonus-related text
 * that wasn't caught by the literal "$500 USDT" replacement.
 *
 * Run with: node --env-file=.env.local scripts/check-weex-fr-zh.mjs
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const rows = await sql`
  SELECT locale, content
  FROM article_translations
  WHERE article_slug = 'weex-review' AND locale IN ('fr', 'zh-CN')
`

for (const r of rows) {
  console.log(`\n===== ${r.locale} =====`)
  // Find any occurrence of "500" in context
  const matches = [...r.content.matchAll(/.{0,60}500.{0,60}/g)]
  if (!matches.length) {
    console.log('  no "500" substring found')
    continue
  }
  matches.forEach((m, i) => {
    console.log(`  [${i + 1}] ${m[0].replace(/\s+/g, ' ').trim()}`)
  })
}
