/**
 * Backfill broken excerpts in article_translations (per-locale copies).
 *
 * Translated excerpts were generated from — or alongside — the old broken
 * English excerpts, so they inherited markdown table rows, raw headings, and in
 * a couple of cases the translation model's own meta-commentary. This re-derives
 * a clean, plain-text excerpt from each row's *translated* content, so the
 * excerpt stays in the correct language.
 *
 * Dry run (default):
 *   node --env-file=.env.local scripts/fix-translation-excerpts.mjs
 *
 * Apply to DB:
 *   node --env-file=.env.local scripts/fix-translation-excerpts.mjs --apply
 */

import { neon } from '@neondatabase/serverless'

const DRY_RUN = !process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)

// ── excerpt logic (kept in sync with content-generator/page.tsx) ─────────────

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
    // language-agnostic boilerplate skip (EN + common translated forms)
    if (/^(disclosure|disclaimer|divulga|avertissement|haftungsausschluss|aviso legal)/i.test(clean)) continue
    // "last updated" date lines (EN, ES, PT, FR, DE, JA, KO)
    if (/^(last updated|updated:|última actualización|última atualização|dernière mise à jour|zuletzt aktualisiert|最終更新|최종 ?업데이트)/i.test(clean)) continue
    return truncateExcerpt(clean)
  }
  return ''
}

function isBadExcerpt(ex) {
  if (!ex || !ex.trim()) return true
  return (
    ex.includes('|') ||
    ex.includes('**') ||
    ex.includes('`') ||
    /\]\(/.test(ex) ||
    /<[^>]+>/.test(ex) ||                 // raw HTML tag leaked in
    /^#{1,6}\s/.test(ex.trim()) ||       // raw heading leaked in
    /^-{3,}/.test(ex.trim())
  )
}

// ── run ──────────────────────────────────────────────────────────────────────

const rows = await sql`SELECT id, article_slug, locale, excerpt, content FROM article_translations ORDER BY article_slug, locale`

let fixed = 0, skipped = 0, unfixable = 0

for (const r of rows) {
  if (!isBadExcerpt(r.excerpt)) { skipped++; continue }

  const next = extractExcerpt(r.content)
  if (!next || isBadExcerpt(next)) {
    unfixable++
    console.log(`\n⚠️  [${r.locale}] ${r.article_slug} — could not derive a clean excerpt`)
    console.log(`    old: ${JSON.stringify(r.excerpt)}`)
    continue
  }

  fixed++
  console.log(`\n✏️  [${r.locale}] ${r.article_slug}`)
  console.log(`    old: ${JSON.stringify((r.excerpt || '').slice(0, 120))}`)
  console.log(`    new: ${JSON.stringify(next)}`)

  if (!DRY_RUN) {
    await sql`UPDATE article_translations SET excerpt = ${next} WHERE id = ${r.id}`
  }
}

console.log(`\n────────────────────────────────────────`)
console.log(`${DRY_RUN ? 'DRY RUN' : 'APPLIED'} — ${fixed} fixed, ${skipped} already clean, ${unfixable} need manual review (of ${rows.length} total)`)
if (DRY_RUN && fixed > 0) console.log(`Re-run with --apply to write these changes.`)
