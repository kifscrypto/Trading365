// Deterministic guard against dead internal links in article bodies.
//
// The AI generator is instructed not to invent internal links, but LLMs ignore
// that rule and emit plausible-but-fake relative links (e.g. a truncated slug
// like /reviews/kucoin-review when the real slug is kucoin-review-fees-us-...).
// Nothing downstream validated them, so they shipped as 404s. This runs at the
// DB write path so no dead internal link can ever persist.

export type ValidArticle = { category_slug: string; slug: string }

// Relative paths that are real routes but not article slugs.
const STATIC_PATHS = new Set([
  '', '/', '/compare', '/bonuses', '/scanner', '/scanner/longs',
  '/about', '/authors', '/live', '/reviews', '/no-kyc', '/guides', '/comparisons',
])

export type LinkFix = { from: string; to: string | null; anchor: string }

/**
 * Rewrite internal markdown links in `content` against the set of real articles:
 *  - slug exists            → keep as-is (normalised to the article's true path)
 *  - dead slug is a unique prefix of exactly one real slug → remap (heals truncation)
 *  - otherwise              → unwrap to plain anchor text (never leave a 404)
 * External links, in-page anchors (#...) and mailto: are left untouched.
 */
export function sanitizeInternalLinks(
  content: string,
  articles: ValidArticle[]
): { content: string; fixes: LinkFix[] } {
  if (!content) return { content, fixes: [] }

  const bySlug = new Map(articles.map(a => [a.slug, a]))
  const fixes: LinkFix[] = []

  const out = content.replace(/\[([^\]]*)\]\((\/[^)\s]*)\)/g, (full, anchor, url) => {
    // only internal links; skip in-page anchors handled as "/#..." rarely
    const [rawPath] = url.split('#')
    const path = rawPath.replace(/\/+$/, '')
    if (STATIC_PATHS.has(path) || path.startsWith('/authors/')) return full

    const seg = path.split('/').filter(Boolean).pop() || ''

    // exact slug match → normalise to the real category path
    const exact = bySlug.get(seg)
    if (exact) {
      const correct = `/${exact.category_slug}/${exact.slug}`
      if (correct === path) return full
      fixes.push({ from: url, to: correct, anchor })
      return `[${anchor}](${correct})`
    }

    // truncated slug → unique real slug that starts with it
    const prefixMatches = articles.filter(a => a.slug.startsWith(seg) && seg.length >= 6)
    if (prefixMatches.length === 1) {
      const a = prefixMatches[0]
      const correct = `/${a.category_slug}/${a.slug}`
      fixes.push({ from: url, to: correct, anchor })
      return `[${anchor}](${correct})`
    }

    // no confident target → unwrap, keep the anchor text so prose still reads
    fixes.push({ from: url, to: null, anchor })
    return anchor
  })

  return { content: out, fixes }
}
