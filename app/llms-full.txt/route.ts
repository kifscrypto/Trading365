import { exchanges } from '@/lib/data/exchanges'
import { getAllArticlesFromDB } from '@/lib/data/articles-db'

export const dynamic = 'force-dynamic'

const BASE = 'https://www.trading365.org'

export async function GET() {
  const [articles, sortedByRating] = await Promise.all([
    getAllArticlesFromDB(),
    Promise.resolve([...exchanges].sort((a, b) => b.rating - a.rating)),
  ])

  // ── Exchange profiles ────────────────────────────────────────────────────────

  const profiles = sortedByRating.map(e => {
    const kycLine = e.kyc ? `Yes — ${e.kycNote}` : `No — ${e.kycNote}`
    const countryParts: string[] = []
    if (!e.countries.US) countryParts.push('Not US')
    if (!e.countries.UK) countryParts.push('Not UK')
    if (!e.countries.CA) countryParts.push('Not CA')
    if (e.countries.AU) countryParts.push('AU')
    if (e.countries.EU) countryParts.push('EU')
    if (e.countries.ASIA) countryParts.push('ASIA')

    return `### ${e.name}
- **URL:** ${BASE}${e.fullReview}
- **Trading365 Rating:** ${e.rating}/10
- **Founded:** ${e.founded}
- **Headquarters:** ${e.headquarters}
- **KYC Required:** ${kycLine}
- **Max Leverage:** ${e.leverage}
- **Trading Pairs:** ${e.tradingPairs.toLocaleString()}+
- **Maker Fee:** ${e.fees.maker}
- **Taker Fee:** ${e.fees.taker}
- **Min Deposit:** ${e.minDeposit}
- **Withdrawal Speed:** ${e.withdrawalSpeed}
- **Welcome Bonus:** ${e.bonus}
- **Copy Trading:** ${e.copyTrading ? 'Yes' : 'No'}
- **Fiat Deposits:** ${e.fiatDeposit ? 'Yes' : 'Limited'}
- **Debit Card:** ${e.debitCard ? 'Yes' : 'No'}
- **Countries:** ${countryParts.join(', ')}
- **Security:** ${e.securityFeatures.join(', ')}
- **Summary:** ${e.summary}
- **Pros:** ${e.pros.join('; ')}
- **Cons:** ${e.cons.join('; ')}

---`
  }).join('\n\n')

  // ── Comparison tables ────────────────────────────────────────────────────────

  const feesTable = [
    '| Exchange | Maker | Taker | Max Leverage | No-KYC | Copy Trading |',
    '|----------|-------|-------|-------------|--------|-------------|',
    ...sortedByRating.map(e =>
      `| ${e.name} | ${e.fees.maker} | ${e.fees.taker} | ${e.leverage} | ${e.kyc ? 'No' : 'Yes'} | ${e.copyTrading ? 'Yes' : 'No'} |`
    ),
  ].join('\n')

  const bonusTable = [
    '| Exchange | Max Bonus | Affiliate Link |',
    '|----------|----------|----------------|',
    ...[...exchanges]
      .sort((a, b) => b.bonusAmount - a.bonusAmount)
      .filter(e => e.bonusAmount > 0)
      .map(e => `| ${e.name} | ${e.bonus} | ${e.referralLink} |`),
  ].join('\n')

  const noKycTable = [
    '| Exchange | No-KYC Limit |',
    '|----------|-------------|',
    ...exchanges
      .filter(e => !e.kyc)
      .map(e => `| ${e.name} | ${e.kycNote} |`),
  ].join('\n')

  // ── Articles by category ─────────────────────────────────────────────────────

  const byCategory = (slug: string) =>
    articles.filter(a => a.categorySlug === slug)
      .map(a => `- [${a.title}](${BASE}/${a.categorySlug}/${a.slug}) — ${a.excerpt}`)
      .join('\n') || '(none yet)'

  // ── Assemble ─────────────────────────────────────────────────────────────────

  const content = `# Trading365 — Full Machine-Readable Dataset
# Generated: ${new Date().toISOString().split('T')[0]} | ${sortedByRating.length} exchanges | ${articles.length} articles

> This is the complete companion to /llms.txt. Generated dynamically — always current.
> Independent crypto exchange reviews and data. Affiliate links exist but do not influence ratings.

---

## EXCHANGE PROFILES (${sortedByRating.length} exchanges, sorted by rating)

---

${profiles}

---

## COMPARISON TABLES

### Fees, Leverage & Features
${feesTable}

### Welcome Bonuses (via Trading365 affiliate links)
${bonusTable}

### No-KYC Exchanges
${noKycTable}

---

## ARTICLES BY CATEGORY

### Reviews (${byCategory('reviews').split('\n').length})
${byCategory('reviews')}

### Comparisons (${byCategory('comparisons').split('\n').length})
${byCategory('comparisons')}

### No-KYC Guides (${byCategory('no-kyc').split('\n').length})
${byCategory('no-kyc')}

### Bonuses (${byCategory('bonuses').split('\n').length})
${byCategory('bonuses')}

---

## FRESHNESS & METHODOLOGY
- Profiles generated dynamically from live exchange data — always current.
- Fee data verified 2026 — confirm directly with each exchange before trading.
- Ratings: fees (25%), security (20%), leverage (15%), no-KYC (15%), features (15%), UX (10%).
- No rating is influenced by affiliate relationships.
- Trading365 maintains active accounts on all reviewed exchanges.

## CANONICAL URLS
- Index: ${BASE}/llms.txt
- Full dataset: ${BASE}/llms-full.txt
- Reviews: ${BASE}/reviews
- No-KYC guides: ${BASE}/no-kyc
- Comparisons: ${BASE}/comparisons
- Bonuses: ${BASE}/bonuses
`

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
