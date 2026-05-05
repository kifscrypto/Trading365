import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

// Load DATABASE_URL from .env.local
const env = readFileSync(envPath, 'utf8')
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
if (!dbUrl) { console.error('DATABASE_URL not found in .env.local'); process.exit(1) }

const sql = neon(dbUrl)

// Extract all markdown links [text](url) from content
function extractLinks(content) {
  const links = []
  const re = /\[([^\]]*)\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(content)) !== null) {
    links.push({ text: m[1], url: m[2] })
  }
  return links
}

function isExternal(url) {
  return url.startsWith('http://') || url.startsWith('https://')
}

// Domains that are fine to link to (trading365 itself + known legit editorial sites)
const ALLOWED_DOMAINS = ['trading365.org', 'trading365.com']

async function main() {
  const [articles, affiliateLinks] = await Promise.all([
    sql`SELECT slug, title, content FROM articles ORDER BY slug`,
    sql`SELECT name, affiliate_url, general_url FROM affiliate_links`,
  ])

  // Build a set of all allowed URLs (affiliate + general)
  const allowedUrls = new Set()
  for (const a of affiliateLinks) {
    if (a.affiliate_url) allowedUrls.add(a.affiliate_url.trim().replace(/\/$/, ''))
    if (a.general_url) allowedUrls.add(a.general_url.trim().replace(/\/$/, ''))
  }

  console.log(`\nScanning ${articles.length} articles against ${allowedUrls.size} allowed URLs...\n`)

  const flagged = []

  for (const article of articles) {
    if (!article.content) continue
    const links = extractLinks(article.content)
    const badLinks = []

    for (const { text, url } of links) {
      if (!isExternal(url)) continue

      // Strip trailing slash for comparison
      const normalised = url.trim().replace(/\/$/, '')

      // Check allowed domains
      const isAllowedDomain = ALLOWED_DOMAINS.some(d => normalised.includes(d))
      if (isAllowedDomain) continue

      // Check exact match in allowlist
      if (allowedUrls.has(normalised)) continue

      // Check if it's a base-URL prefix match (e.g. allowlist has https://x.com/ref and article uses that exact URL)
      const partialMatch = [...allowedUrls].some(allowed => normalised.startsWith(allowed) || allowed.startsWith(normalised))
      if (partialMatch) continue

      badLinks.push({ text, url })
    }

    if (badLinks.length > 0) {
      flagged.push({ slug: article.slug, title: article.title, badLinks })
    }
  }

  if (flagged.length === 0) {
    console.log('✅ All articles clean — no rogue external links found.')
    return
  }

  console.log(`⚠️  ${flagged.length} article(s) have rogue external links:\n`)
  for (const { slug, title, badLinks } of flagged) {
    console.log(`\n📄 ${title}`)
    console.log(`   slug: ${slug}`)
    for (const { text, url } of badLinks) {
      console.log(`   ❌ [${text}](${url})`)
    }
  }

  console.log(`\n--- SUMMARY ---`)
  console.log(`Total articles scanned : ${articles.length}`)
  console.log(`Articles with bad links: ${flagged.length}`)
  console.log(`Total rogue links      : ${flagged.reduce((n, a) => n + a.badLinks.length, 0)}`)
  console.log('\nAllowed affiliate URLs in DB:')
  for (const u of [...allowedUrls].sort()) console.log(`  ${u}`)
}

main().catch(e => { console.error(e); process.exit(1) })
