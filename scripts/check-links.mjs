import { neon } from '@neondatabase/serverless'

const DATABASE_URL = 'postgresql://neondb_owner:npg_yD6AjICnehQ8@ep-green-bonus-amhtv7wl-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'
const sql = neon(DATABASE_URL)

const articles = await sql`SELECT id, slug, title, category_slug, content FROM articles WHERE published = true ORDER BY date DESC`

// Build a set of all valid internal paths
const validPaths = new Set([
  ...articles.map(a => `/${a.category_slug}/${a.slug}`),
  '/bonuses', '/reviews', '/comparisons', '/no-kyc', '/compare', '/about', '/guides', '/join-our-newsletter', '/privacy', '/terms', '/disclaimer',
])

// Extract all internal markdown links from content
const linkRe = /\[([^\]]+)\]\((\/[^)]+)\)/g

const broken = []

for (const article of articles) {
  const articleUrl = `/${article.category_slug}/${article.slug}`
  const content = article.content ?? ''
  let m
  const badLinks = []
  while ((m = linkRe.exec(content)) !== null) {
    const [, anchor, href] = m
    // Normalise — strip hash/query
    const path = href.split('?')[0].split('#')[0]
    if (!validPaths.has(path)) {
      badLinks.push({ anchor, href })
    }
  }
  if (badLinks.length) {
    broken.push({ articleUrl, title: article.title, badLinks })
  }
}

// Also check for .com links and bad absolute self-links
const dotComRe = /trading365\.com/g
const absRe = /https?:\/\/(www\.)?trading365\.org/g
for (const article of articles) {
  const c = article.content ?? ''
  const comHits = [...c.matchAll(dotComRe)]
  const absHits = [...c.matchAll(absRe)]
  if (comHits.length || absHits.length) {
    broken.push({
      articleUrl: `/${article.category_slug}/${article.slug}`,
      title: article.title,
      badLinks: [
        ...comHits.map(() => ({ anchor: '', href: 'trading365.com link found' })),
        ...absHits.map(() => ({ anchor: '', href: 'absolute trading365.org URL found (should be relative)' })),
      ],
    })
  }
}

if (broken.length === 0) {
  console.log('✓ No broken internal links found.')
} else {
  console.log(`⚠ Found broken links in ${broken.length} article(s):\n`)
  for (const { articleUrl, title, badLinks } of broken) {
    console.log(`📄 ${title}`)
    console.log(`   ${articleUrl}`)
    for (const { anchor, href } of badLinks) {
      console.log(`   ✗  [${anchor}](${href})`)
    }
    console.log()
  }
}
