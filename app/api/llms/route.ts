import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { exchanges } from "@/lib/data/exchanges"

export async function GET() {
  const articles = await getAllArticlesFromDB()
  const base = "https://www.trading365.org"

  const content = `# Trading365

> Expert crypto exchange reviews, comparisons, no-KYC guides, and exclusive sign-up bonus deals. Unbiased analysis to help traders find the best crypto trading platforms.

Trading365 covers centralized cryptocurrency exchanges with a focus on derivatives trading, futures, leverage, KYC requirements, and sign-up bonuses. All reviews include hands-on testing, fee analysis, security audits, and affiliate referral links.

## Site Sections

- [Exchange Reviews](${base}/reviews): In-depth reviews of major crypto trading platforms
- [Comparisons](${base}/comparisons): Side-by-side exchange matchups
- [Compare Tool](${base}/compare): Interactive exchange comparison tool
- [No-KYC Exchanges](${base}/no-kyc): Exchanges that allow trading without identity verification
- [Bonuses & Deals](${base}/bonuses): Exclusive sign-up bonuses and referral rewards
- [Newsletter](${base}/join-our-newsletter): Weekly market insights and exchange deals
- [About](${base}/about): About Trading365

## Exchanges Covered

${exchanges
    .map(
      (e) =>
        `- **${e.name}** (${base}/reviews/${e.slug}-review): Rated ${e.rating}/10. ${e.pros[0]}. Bonus: ${e.bonus}.`
    )
    .join("\n")}

## Recent Articles

${articles
    .slice(0, 20)
    .map((a) => `- [${a.title}](${base}/${a.categorySlug}/${a.slug}) — ${a.excerpt}`)
    .join("\n")}

## Key Facts

- All exchange reviews are independently written by the Trading365 editorial team
- Ratings are scored out of 10 across fees, security, UX, leverage, KYC, and bonuses
- Site contains affiliate/referral links -- disclosed per FTC guidelines
- Content is updated regularly as exchange terms and promotions change
- Founded to help crypto traders navigate an increasingly complex exchange landscape
`

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
