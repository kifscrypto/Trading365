/**
 * Backfill broken meta_description in article_translations.
 *
 * Some translated meta descriptions are raw title headings ("# Is BingX worth
 * using..."), stray HTML, or were never translated at all — all of which ship
 * straight into the page's <meta name="description"> tag. This re-derives a
 * clean, in-language description from each row's translated content.
 *
 * Dry run (default):
 *   node --env-file=.env.local scripts/fix-translation-meta.mjs
 * Apply:
 *   node --env-file=.env.local scripts/fix-translation-meta.mjs --apply
 */

import { neon } from '@neondatabase/serverless'

const DRY_RUN = !process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)

function stripInlineMarkdown(s) {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, ' ')
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
    if (/^(disclosure|disclaimer|divulga|avertissement|haftungsausschluss|aviso legal)/i.test(clean)) continue
    if (/^(last updated|updated:|última actualización|última atualização|dernière mise à jour|zuletzt aktualisiert|最終更新|최종 ?업데이트)/i.test(clean)) continue
    return truncateExcerpt(clean)
  }
  return ''
}

function isBad(md) {
  if (!md || !md.trim()) return true
  const t = md.trim()
  return (
    t.includes('|') || t.includes('**') || t.includes('`') ||
    /\]\(/.test(t) || /<[^>]+>/.test(t) || /^#{1,6}\s/.test(t) || /^-{3,}/.test(t)
  )
}

const rows = await sql`SELECT id, article_slug, locale, meta_description, content FROM article_translations ORDER BY article_slug, locale`

let fixed = 0, skipped = 0, unfixable = 0
for (const r of rows) {
  if (!isBad(r.meta_description)) { skipped++; continue }
  const next = extractExcerpt(r.content)
  if (!next || isBad(next)) {
    unfixable++
    console.log(`\n⚠️  [${r.locale}] ${r.article_slug} — could not derive`)
    console.log(`    old: ${JSON.stringify((r.meta_description||'').slice(0,110))}`)
    continue
  }
  fixed++
  console.log(`\n✏️  [${r.locale}] ${r.article_slug}`)
  console.log(`    old: ${JSON.stringify((r.meta_description||'').slice(0,110))}`)
  console.log(`    new: ${JSON.stringify(next)}`)
  if (!DRY_RUN) await sql`UPDATE article_translations SET meta_description = ${next} WHERE id = ${r.id}`
}

console.log(`\n────────────────────────────────────────`)
console.log(`${DRY_RUN ? 'DRY RUN' : 'APPLIED'} — ${fixed} fixed, ${skipped} already clean, ${unfixable} need manual review (of ${rows.length} total)`)
if (DRY_RUN && fixed > 0) console.log(`Re-run with --apply to write these changes.`)
