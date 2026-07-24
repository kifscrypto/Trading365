/**
 * FULL read-only audit of every article + every translation.
 * Flags: coverage gaps, corrupted short fields, abridged/dropped content,
 * leading duplicate H1, format drift (md<->html), untranslated CJK, empty bodies.
 * Writes a JSON report; prints a summary. Makes NO changes.
 *
 *   node --env-file=.env.local scripts/audit-translations.mjs
 */
import { neon } from '@neondatabase/serverless'
import { writeFileSync } from 'node:fs'

const sql = neon(process.env.DATABASE_URL)
const ALL_LOCALES = ['de','es','fr','ja','ko','pt','ru','zh-CN','zh-TW']
const INDEXED = ['zh-CN','zh-TW','ko','ja']
const CJK = new Set(['zh-CN','zh-TW','ja','ko'])

const isHtml = (c) => /<(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|blockquote|img)\b/i.test(c || '')
const cjkRatio = (s) => {
  const t = (s || '').replace(/\s/g, '')
  if (!t.length) return 0
  const m = t.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []
  return m.length / t.length
}
const cyrRatio = (s) => {
  const t = (s || '').replace(/\s/g, '')
  if (!t.length) return 0
  const m = t.match(/[\u0400-\u04ff]/g) || []
  return m.length / t.length
}

const articles = await sql`SELECT slug, title, content, excerpt, meta_title, meta_description FROM articles ORDER BY slug`
const enBySlug = new Map(articles.map(a => [a.slug, a]))
const translations = await sql`SELECT * FROM article_translations`
const trByKey = new Map(translations.map(t => [`${t.article_slug}|${t.locale}`, t]))

const findings = []
function flag(slug, locale, type, detail) { findings.push({ slug, locale, type, detail }) }

// 1) English article sanity
for (const a of articles) {
  if (!a.content || a.content.length < 200) flag(a.slug, 'EN', 'en-empty-content', `len=${(a.content||'').length}`)
  if (!a.title || a.title.length > 160 || a.title.includes('\n')) flag(a.slug, 'EN', 'en-bad-title', JSON.stringify((a.title||'').slice(0,60)))
}

// 2) Coverage gaps (indexed locales are the priority)
for (const a of articles) {
  for (const loc of ALL_LOCALES) {
    if (!trByKey.has(`${a.slug}|${loc}`)) {
      flag(a.slug, loc, INDEXED.includes(loc) ? 'missing-INDEXED' : 'missing', 'no translation row')
    }
  }
}

// 3) Per-translation content/field checks
for (const t of translations) {
  const en = enBySlug.get(t.article_slug)
  const enLen = en?.content?.length || 0
  const c = t.content || ''

  // corrupted short fields (runaway body dumped in)
  if ((t.title || '').includes('\n') || (t.title || '').length > 120)
    flag(t.article_slug, t.locale, 'title-corrupt', `len=${(t.title||'').length}`)
  if ((t.meta_title || '').includes('\n') || (t.meta_title || '').length > 120)
    flag(t.article_slug, t.locale, 'meta_title-corrupt', `len=${(t.meta_title||'').length}`)
  if ((t.meta_description || '').includes('\n') || (t.meta_description || '').length > 400)
    flag(t.article_slug, t.locale, 'meta_desc-corrupt', `len=${(t.meta_description||'').length}`)
  if (/[|]|\*\*|\]\(|^#{1,6}\s|<[a-z]+>/m.test(t.excerpt || ''))
    flag(t.article_slug, t.locale, 'excerpt-corrupt', JSON.stringify((t.excerpt||'').slice(0,60)))

  // empty / abridged content
  if (c.length < 200) {
    flag(t.article_slug, t.locale, 'content-empty', `len=${c.length}`)
  } else if (enLen > 2500) {
    const ratio = c.length / enLen
    const floor = CJK.has(t.locale) ? 0.22 : 0.55
    if (ratio < floor) flag(t.article_slug, t.locale, 'content-abridged', `${Math.round(ratio*100)}% of EN (tr=${c.length}, en=${enLen})`)
  }

  // leading duplicate H1
  if (/^\ufeff?\s*(#\s+\S|<h1\b)/i.test(c))
    flag(t.article_slug, t.locale, 'content-leading-h1', JSON.stringify(c.slice(0,50)))

  // format drift: EN markdown but translation HTML or vice-versa
  if (en && isHtml(en.content) !== isHtml(c))
    flag(t.article_slug, t.locale, 'format-drift', `EN html=${isHtml(en.content)} / TR html=${isHtml(c)}`)

  // untranslated (still English) — only reliably detectable for CJK + ru
  if (c.length >= 200) {
    if (CJK.has(t.locale) && cjkRatio(c) < 0.15)
      flag(t.article_slug, t.locale, 'content-untranslated', `cjk chars ${Math.round(cjkRatio(c)*100)}%`)
    if (t.locale === 'ru' && cyrRatio(c) < 0.30)
      flag(t.article_slug, t.locale, 'content-untranslated', `cyrillic ${Math.round(cyrRatio(c)*100)}%`)
  }
}

// ── report ────────────────────────────────────────────────────────────────
const byType = {}
for (const f of findings) byType[f.type] = (byType[f.type] || 0) + 1
const indexedFindings = findings.filter(f => f.locale === 'EN' || INDEXED.includes(f.locale) || f.type.includes('INDEXED'))

console.log(`\n================= AUDIT: ${articles.length} articles, ${translations.length} translations =================`)
console.log(`Total findings: ${findings.length}   (Google-indexed-locale + EN findings: ${indexedFindings.length})\n`)
console.log('By type:')
console.table(Object.fromEntries(Object.entries(byType).sort((a,b)=>b[1]-a[1])))

// content problems (data loss) — the serious ones, listed in full
const serious = findings.filter(f => ['content-abridged','content-empty','content-untranslated','content-leading-h1','missing-INDEXED'].includes(f.type))
console.log(`\n--- SERIOUS content findings (${serious.length}) ---`)
console.table(serious.map(f => ({ slug: f.slug.slice(0,34), locale: f.locale, type: f.type, detail: f.detail })))

const out = 'C:/Users/Lee/AppData/Local/Temp/claude/C--Users-Lee-OneDrive-JOEY--Asylum--Website-Update-MAX-App-b-kCvikUTsguv-1774850652250/2945c516-53f4-4e1b-bbc6-d71ad3f7cb02/scratchpad/audit-report.json'
writeFileSync(out, JSON.stringify({ generatedFor: 'trading365', articles: articles.length, translations: translations.length, byType, findings }, null, 2))
console.log(`\nFull machine-readable report: ${out}`)
