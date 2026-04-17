import { neon } from '@neondatabase/serverless'

const DATABASE_URL = 'postgresql://neondb_owner:npg_yD6AjICnehQ8@ep-green-bonus-amhtv7wl-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'
const sql = neon(DATABASE_URL)

const articles = await sql`SELECT id, slug, title, category_slug, content FROM articles WHERE published = true ORDER BY date DESC`

// Build lookup: slug → correct path
const slugToPath = new Map(articles.map(a => [a.slug, `/${a.category_slug}/${a.slug}`]))

// Static pages that are valid but not in DB
const validStaticPaths = new Set(['/bonuses', '/reviews', '/comparisons', '/no-kyc', '/compare', '/about', '/guides'])

const linkRe = /\[([^\]]+)\]\((\/[^)#?]+)[^)]*\)/g

let totalFixed = 0
let totalRemoved = 0
let totalArticlesUpdated = 0

for (const article of articles) {
  const original = article.content ?? ''
  let updated = original

  // Find all internal links
  const matches = [...original.matchAll(linkRe)]
  if (!matches.length) continue

  let changed = false
  for (const [full, anchor, href] of matches) {
    const path = href.split('?')[0].split('#')[0]

    // Already valid — skip
    if (validStaticPaths.has(path)) continue

    // Check if path is valid
    const pathIsValid = [...slugToPath.values()].some(p => p === path)
    if (pathIsValid) continue

    // Extract slug from path (last segment)
    const slug = path.split('/').filter(Boolean).pop()

    if (slug && slugToPath.has(slug)) {
      // Wrong category — fix the path
      const correctPath = slugToPath.get(slug)
      const corrected = full.replace(href, correctPath)
      updated = updated.split(full).join(corrected)
      console.log(`  ✓ Fixed: ${href} → ${correctPath}  (in "${article.title}")`)
      totalFixed++
      changed = true
    } else {
      // Genuinely doesn't exist — strip the link, keep the anchor text
      const stripped = anchor
      updated = updated.split(full).join(stripped)
      console.log(`  ✗ Removed dead link [${anchor}](${href})  (in "${article.title}")`)
      totalRemoved++
      changed = true
    }
  }

  if (changed) {
    await sql`UPDATE articles SET content = ${updated}, updated_at = NOW() WHERE id = ${article.id}`
    totalArticlesUpdated++
  }
}

console.log(`\nDone. ${totalArticlesUpdated} articles updated — ${totalFixed} links fixed, ${totalRemoved} dead links removed.`)
