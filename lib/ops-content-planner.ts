export type OpsContentItem = {
  id: string
  date: string
  title: string
  keyword?: string
  articleType?: string
  status: string
  postedX?: boolean
  quoraDraft?: boolean
  [key: string]: unknown
}

export type ArticleCoverage = {
  title?: string | null
  slug?: string | null
}

export type ContentCandidate = {
  title: string
  keyword: string
  articleType: string
}

const EXCLUDED_EXCHANGES = new Set(['bitmart', 'ascendex'])
const PRIORITY_EXCHANGES = [
  'Bybit', 'WEEX', 'MEXC', 'BingX', 'Bitunix', 'BYDFi', 'OKX',
  'KuCoin', 'Bitget', 'Gate.io', 'Kraken', 'Coinbase', 'Phemex',
]
const COUNTRY_SERIES = [
  ['Germany', 'best crypto exchange germany'],
  ['India', 'best crypto exchange india'],
  ['Brazil', 'best crypto exchange brazil'],
  ['Nigeria', 'best crypto exchange nigeria'],
  ['the Philippines', 'best crypto exchange philippines'],
  ['Singapore', 'best crypto exchange singapore'],
  ['Turkey', 'best crypto exchange turkey'],
  ['the UAE', 'best crypto exchange uae'],
]
const EVERGREEN: ContentCandidate[] = [
  ['How to Read a Crypto Order Book (Depth, Spread & Walls, Simply)', 'how to read order book', 'how_to'],
  ['Liquidation Cascades Explained: Why Price Moves Faster Than You Think', 'liquidation cascade explained', 'explainer'],
  ['How to Transfer Crypto Between Exchanges Without Losing It (Network, Memo & Fee Checks)', 'how to transfer crypto between exchanges', 'how_to'],
  ['What Is Slippage? Why Your Market Order Fills Worse Than Expected', 'what is slippage crypto', 'explainer'],
  ['Maker vs Taker Fees Explained: The Difference That Costs You Thousands', 'maker vs taker fees', 'explainer'],
  ['How to Set Up Two-Factor Authentication on Any Exchange (And the Mistake to Avoid)', 'how to set up 2fa crypto exchange', 'how_to'],
  ['What Is a Funding Rate Arbitrage? The Basis Trade, Without the Jargon', 'funding rate arbitrage', 'explainer'],
  ["How to Check an Exchange's Proof of Reserves (And What It Doesn't Tell You)", 'proof of reserves explained', 'how_to'],
  ['Isolated vs Cross Margin: Which One Keeps You Alive?', 'isolated vs cross margin', 'explainer'],
  ['How to Avoid Dust Balances When Moving Between Exchanges', 'crypto dust balances', 'how_to'],
].map(([title, keyword, articleType]) => ({ title, keyword, articleType }))

const GENERIC = new Set([
  'review', 'reviews', '2024', '2025', '2026', '2027', 'best', 'top', 'the', 'a',
  'an', 'for', 'to', 'is', 'it', 'its', 'how', 'what', 'which', 'who', 'why',
  'crypto', 'exchange', 'exchanges', 'trading', 'guide', 'vs', 'and', 'in', 'of',
  'on', 'your', 'you', 'with', 'explained', 'new', 'update', 'updated', 'now',
  'actually', 'really', 'still', 'worth', 'using', 'use', 'residents',
])

type CorpusEntry = [string, string]

function tokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter(token => !GENERIC.has(token) && token.length > 1),
  )
}

function slugish(text: string): string {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-')
}

function sameToken(a: string, b: string): boolean {
  if (a === b) return true
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  return prefix >= 5 && prefix / Math.min(a.length, b.length) >= 0.7
}

function matchedCount(keywordTokens: Set<string>, entryTokens: Set<string>): number {
  return [...keywordTokens].filter(keyword =>
    [...entryTokens].some(entry => sameToken(keyword, entry)),
  ).length
}

function isCovered(keyword: string, corpus: CorpusEntry[]): boolean {
  const keywordSlug = slugish(keyword)
  const keywordTokens = tokens(keyword)
  for (const [title, slug] of corpus) {
    const slugTokens = tokens(slug.replaceAll('-', ' '))
    if (keywordSlug && slug && (keywordSlug === slug || slug.startsWith(`${keywordSlug}-`))) return true
    if (keywordTokens.size < 2) {
      if (keywordTokens.size && matchedCount(keywordTokens, slugTokens) === keywordTokens.size) return true
      continue
    }
    const entryTokens = new Set([...tokens(title), ...slugTokens])
    const matched = matchedCount(keywordTokens, entryTokens)
    if (matched === keywordTokens.size || matched / keywordTokens.size >= 0.75) return true
  }
  return false
}

function interleave(...pools: ContentCandidate[][]): ContentCandidate[] {
  const remaining = pools.map(pool => [...pool])
  const output: ContentCandidate[] = []
  while (remaining.some(pool => pool.length)) {
    for (const pool of remaining) {
      const candidate = pool.shift()
      if (candidate) output.push(candidate)
    }
  }
  return output
}

function buildCandidates(affiliateNames: string[]): ContentCandidate[] {
  const reviews = affiliateNames
    .filter(name => !EXCLUDED_EXCHANGES.has(name.toLowerCase()))
    .map(name => ({
      title: `${name} Review 2026: Fees, Safety & Who It's Actually For`,
      keyword: `${name.toLowerCase()} review`,
      articleType: 'exchange_review',
    }))
  const comparisons: ContentCandidate[] = []
  for (let i = 0; i < PRIORITY_EXCHANGES.length; i++) {
    const a = PRIORITY_EXCHANGES[i]
    for (const b of PRIORITY_EXCHANGES.slice(i + 1)) {
      comparisons.push({
        title: `${a} vs ${b} 2026: Fees, Features & Which Wins`,
        keyword: `${a.toLowerCase()} vs ${b.toLowerCase()}`,
        articleType: 'comparison',
      })
    }
  }
  const countries = COUNTRY_SERIES.map(([region, keyword]) => ({
    title: `Best Crypto Exchanges for ${region} Residents in 2026`,
    keyword,
    articleType: 'listicle',
  }))
  return [...reviews, ...interleave(comparisons, countries, EVERGREEN)]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0') + Date.now().toString(36)
}

export function replaceIdea(
  items: OpsContentItem[],
  articles: ArticleCoverage[],
  affiliateNames: string[],
  rejectId: string,
): { items: OpsContentItem[]; replacement: OpsContentItem } {
  const target = items.find(item => item.id === rejectId)
  if (!target) throw new Error('The calendar item no longer exists')
  if (target.status !== 'idea') throw new Error('Only ideas can be rejected and replaced')
  if (!target.date) throw new Error('The idea has no scheduled date')

  const corpus: CorpusEntry[] = [
    ...articles.map(article => [article.title ?? '', article.slug ?? ''] as CorpusEntry),
    ...items.map(item => [item.title, slugish(item.keyword || item.title)] as CorpusEntry),
  ]
  const candidate = buildCandidates(affiliateNames).find(item => !isCovered(item.keyword, corpus))
  if (!candidate) throw new Error('No fresh replacement topics are available')

  const replacement: OpsContentItem = {
    id: uid(),
    date: target.date,
    ...candidate,
    status: 'idea',
    postedX: false,
    quoraDraft: false,
  }
  return {
    items: [
      ...items.map(item => item.id === rejectId ? { ...item, status: 'rejected' } : item),
      replacement,
    ],
    replacement,
  }
}
