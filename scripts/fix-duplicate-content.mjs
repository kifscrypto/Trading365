/**
 * Fix two duplicate-content bugs across all articles:
 *
 * Bug 1: An H2 heading identical/near-identical to the article title, followed
 *        immediately by a markdown table + optional --- divider, at the very start
 *        of the content. Removes the H2 + table + divider.
 *
 * Bug 2: A ## Quick Facts section (heading + table) that duplicates the DB sidebar.
 *        Removes from ## Quick Facts down to and including the next --- divider.
 *
 * Dry run (default):
 *   node --env-file=.env.local scripts/fix-duplicate-content.mjs
 *
 * Apply to DB:
 *   node --env-file=.env.local scripts/fix-duplicate-content.mjs --apply
 */

import { neon } from '@neondatabase/serverless'

const DRY_RUN = !process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)

const articles = await sql`SELECT id, slug, title, content FROM articles ORDER BY slug`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(text) {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  )
}

function titleSimilarity(h2Text, title) {
  const a = normalize(h2Text)
  const b = normalize(title)
  const intersection = [...a].filter(w => b.has(w))
  return intersection.length / Math.max(a.size, b.size)
}

// ---------------------------------------------------------------------------
// Bug 1: title-duplicate H2 + table at the very start of content
// ---------------------------------------------------------------------------
function fix1(content, title) {
  const lines = content.split('\n')

  // Skip leading blank lines
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return null

  const firstLine = lines[i]
  if (!firstLine.startsWith('## ')) return null

  const h2Text = firstLine.replace(/^##\s+/, '').trim()
  if (titleSimilarity(h2Text, title) < 0.45) return null

  // Skip blank lines between H2 and table
  let j = i + 1
  while (j < lines.length && lines[j].trim() === '') j++

  // Must be immediately followed by a markdown table
  if (j >= lines.length || !lines[j].startsWith('|')) return null

  const blockStart = i

  // Consume all table rows and surrounding blank lines
  let k = j
  while (k < lines.length && (lines[k].startsWith('|') || lines[k].trim() === '')) k++

  // Consume the trailing --- divider if present
  if (k < lines.length && /^-{3,}\s*$/.test(lines[k])) k++

  const removed = lines.slice(blockStart, k).join('\n')
  const result = lines.slice(k).join('\n').trimStart()

  return { removed, result }
}

// ---------------------------------------------------------------------------
// Bug 2: ## Quick Facts block (heading + table + --- divider)
// ---------------------------------------------------------------------------
function fix2(content) {
  const lines = content.split('\n')

  const qfIdx = lines.findIndex(l => /^## Quick Facts\s*$/.test(l))
  if (qfIdx === -1) return null

  // Walk forward until we hit a --- divider or the next heading (safety stop)
  let k = qfIdx + 1
  while (k < lines.length) {
    if (/^-{3,}\s*$/.test(lines[k])) {
      k++ // include the --- itself
      break
    }
    // Safety: stop at the next heading if no --- found yet
    if (/^#{1,6} /.test(lines[k]) && k > qfIdx + 1) break
    k++
  }

  const removed = lines.slice(qfIdx, k).join('\n')

  // Trim trailing blank lines from the block before Quick Facts
  const before = lines.slice(0, qfIdx)
  while (before.length && before[before.length - 1].trim() === '') before.pop()

  const after = lines.slice(k)
  const result = [...before, ...after].join('\n')

  return { removed, result }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const changes = []

for (const article of articles) {
  let content = article.content
  const fixes = []

  const f1 = fix1(content, article.title)
  if (f1) {
    fixes.push({ bug: 1, description: 'Title-duplicate H2 + table at start', removed: f1.removed })
    content = f1.result
  }

  const f2 = fix2(content)
  if (f2) {
    fixes.push({ bug: 2, description: '## Quick Facts block', removed: f2.removed })
    content = f2.result
  }

  if (fixes.length > 0) {
    changes.push({ id: article.id, slug: article.slug, title: article.title, newContent: content, fixes })
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(70)}`)
console.log(`${DRY_RUN ? 'DRY RUN' : 'APPLYING'}: ${changes.length} article(s) affected`)
console.log('='.repeat(70))

for (const c of changes) {
  console.log(`\n--- ${c.slug} ---`)
  console.log(`Title: ${c.title.trim()}`)
  for (const f of c.fixes) {
    console.log(`\n  [Bug ${f.bug}] ${f.description}`)
    console.log('  REMOVING:')
    console.log(f.removed.split('\n').map(l => '  > ' + l).join('\n'))
  }
  console.log('\n  NEW CONTENT STARTS WITH:')
  console.log(c.newContent.slice(0, 300).split('\n').map(l => '  | ' + l).join('\n'))
  console.log('  ...')
}

if (DRY_RUN) {
  console.log(`\n${'='.repeat(70)}`)
  console.log('DRY RUN complete — no changes written.')
  console.log('Run with --apply to commit to the database.')
  console.log('='.repeat(70))
} else {
  console.log('\nApplying changes...')
  for (const c of changes) {
    await sql`UPDATE articles SET content = ${c.newContent}, updated_at = NOW() WHERE id = ${c.id}`
    console.log(`  ✓ Updated: ${c.slug} (id=${c.id})`)
  }
  console.log(`\nDone. ${changes.length} article(s) updated.`)
}
