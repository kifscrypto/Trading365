import { neon } from '@neondatabase/serverless'

const sql = neon('postgresql://neondb_owner:npg_yD6AjICnehQ8@ep-green-bonus-amhtv7wl-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require')

const articles = await sql`SELECT id, slug, title, category_slug, content FROM articles WHERE published = true`

// Build slug → correct path map
const slugToPath = new Map(articles.map(a => [a.slug, `/${a.category_slug}/${a.slug}`]))

const validStaticPaths = new Set(['/bonuses', '/reviews', '/comparisons', '/no-kyc', '/compare', '/about', '/guides', '/join-our-newsletter', '/privacy', '/terms', '/disclaimer'])

let totalFixed = 0

for (const article of articles) {
  let content = article.content ?? ''
  let changed = false

  // 1. Fix trading365.com → trading365.org (any form)
  if (content.includes('trading365.com')) {
    content = content
      .replace(/https?:\/\/(www\.)?trading365\.com/g, 'https://www.trading365.org')
      .replace(/\/trading365\.com\//g, '/')
    changed = true
    console.log(`  ✓ .com → .org fixed in: ${article.title}`)
  }

  // 2. Fix absolute trading365.org links → relative, and fix missing category
  const absRe = /\[([^\]]+)\]\(https?:\/\/(www\.)?trading365\.org(\/[^)]*)\)/g
  const absMatches = [...content.matchAll(absRe)]
  for (const [full, anchor, , path] of absMatches) {
    // Strip to relative path and fix category if needed
    const cleanPath = path.split('?')[0].split('#')[0]
    const slug = cleanPath.split('/').filter(Boolean).pop()
    let correctPath = cleanPath

    // If path is missing a valid category (e.g. /bingx-review instead of /reviews/bingx-review)
    const parts = cleanPath.split('/').filter(Boolean)
    if (parts.length === 1 && slug && slugToPath.has(slug)) {
      correctPath = slugToPath.get(slug)
    }

    const fixed = `[${anchor}](${correctPath})`
    if (fixed !== full) {
      content = content.split(full).join(fixed)
      changed = true
      console.log(`  ✓ Absolute URL fixed in "${article.title}": ${full} → ${fixed}`)
    }
  }

  if (changed) {
    await sql`UPDATE articles SET content = ${content}, updated_at = NOW() WHERE id = ${article.id}`
    totalFixed++
  }
}

if (totalFixed === 0) {
  console.log('No issues found.')
} else {
  console.log(`\nFixed ${totalFixed} article(s).`)
}
