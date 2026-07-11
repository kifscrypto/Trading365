/**
 * Backfill broken article excerpts.
 *
 * The old content-generator picked the first line >40 chars that wasn't a
 * heading/bullet — which let markdown TABLE ROWS (| ... | ... |) and inline
 * markdown (**bold**, `code`, [links]) leak into the excerpt. Those render as
 * junk in meta descriptions and article cards.
 *
 * This re-derives a clean, plain-text excerpt from the article body using the
 * same logic as the fixed extractExcerpt(), but only rewrites excerpts that are
 * actually bad (contain table pipes, markdown markers, or are empty).
 *
 * Dry run (default):
 *   node --env-file=.env.local scripts/fix-excerpts.mjs
 *
 * Apply to DB:
 *   node --env-file=.env.local scripts/fix-excerpts.mjs --apply
 */

import { neon } from '@neondatabase/serverless'

const DRY_RUN = !process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)

// ── excerpt logic (kept in sync with content-generator/page.tsx) ─────────────

function stripInlineMarkdown(s) {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) / ![alt](url) -> text/alt
    .replace(/(\*\*|__)(.*?)\1/g, '$2')          // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')             // italic
    .replace(/`([^`]*)`/g, '$1')                 // inline code
    .replace(/~~(.*?)~~/g, '$1')                 // strikethrough
    .replace(/<[^>]+>/g, ' ')                    // stray HTML tags
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateExcerpt(clean) {
  if (clean.length <= 200) return clean
  const cut = clean.slice(0, 200)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (lastStop > 120) return cut.slice(0, lastStop + 1).trim()
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

function extractExcerpt(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean)
  for (const raw of lines) {
    if (/^#{1,6}\s/.test(raw)) continue
    if (/^[-*+]\s/.test(raw)) continue
    if (/^\d+\.\s/.test(raw)) continue
    if (raw.startsWith('|')) continue
    if (raw.startsWith('>')) continue
    if (/^-{3,}$/.test(raw)) continue
    const clean = stripInlineMarkdown(raw)
    if (clean.length <= 40) continue
    if (/^(disclosure|disclaimer)\b/i.test(clean)) continue
    if (/^(last updated|updated:)/i.test(clean)) continue
    return truncateExcerpt(clean)
  }
  return ''
}

// An excerpt is "bad" if it carries table/markdown junk or is empty.
function isBadExcerpt(ex) {
  if (!ex || !ex.trim()) return true
  return (
    ex.includes('|') ||       // markdown table row/separator
    ex.includes('**') ||      // leftover bold
    ex.includes('`') ||       // inline code
    /\]\(/.test(ex) ||        // markdown link
    /<[^>]+>/.test(ex) ||     // raw HTML tag
    /^#{1,6}\s/.test(ex.trim()) || // raw heading
    /^-{3,}/.test(ex.trim())  // separator
  )
}

// ── run ──────────────────────────────────────────────────────────────────────

const articles = await sql`SELECT id, slug, excerpt, content FROM articles ORDER BY slug`

let fixed = 0
let skipped = 0
let unfixable = 0

for (const a of articles) {
  if (!isBadExcerpt(a.excerpt)) { skipped++; continue }

  const next = extractExcerpt(a.content)
  if (!next || isBadExcerpt(next)) {
    unfixable++
    console.log(`\n⚠️  ${a.slug} — could not derive a clean excerpt`)
    console.log(`    old: ${JSON.stringify(a.excerpt)}`)
    continue
  }

  fixed++
  console.log(`\n✏️  ${a.slug}`)
  console.log(`    old: ${JSON.stringify(a.excerpt)}`)
  console.log(`    new: ${JSON.stringify(next)}`)

  if (!DRY_RUN) {
    await sql`UPDATE articles SET excerpt = ${next} WHERE id = ${a.id}`
  }
}

console.log(`\n────────────────────────────────────────`)
console.log(`${DRY_RUN ? 'DRY RUN' : 'APPLIED'} — ${fixed} fixed, ${skipped} already clean, ${unfixable} need manual review (of ${articles.length} total)`)
if (DRY_RUN && fixed > 0) console.log(`Re-run with --apply to write these changes.`)
