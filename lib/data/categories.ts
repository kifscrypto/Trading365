import type { CategoryMeta } from "./types"

export const categories: CategoryMeta[] = [
  {
    slug: "reviews",
    title: "Exchange Reviews",
    description: "In-depth analysis of major crypto trading platforms",
    longDescription:
      "Our exchange reviews are based on firsthand testing, covering fees, security, user experience, and overall value. Each review follows our transparent methodology to give you an unbiased assessment.",
  },
  {
    slug: "comparisons",
    title: "Exchange Comparisons",
    description: "Side-by-side exchange matchups to find your best fit",
    longDescription:
      "Can't decide between two exchanges? Our head-to-head comparisons break down the key differences in fees, features, security, and user experience to help you make the right choice.",
  },
  {
    slug: "no-kyc",
    title: "No-KYC Exchanges",
    description: "Trade without identity verification requirements",
    longDescription:
      "New to no-KYC trading? Start with our guide: [What Is KYC in Crypto?](/no-kyc/what-is-kyc-crypto) For privacy-focused traders, we maintain a curated list of reliable no-KYC exchanges. Each listing is verified for security, liquidity, and user experience.",
  },
  {
    slug: "bonuses",
    title: "Bonuses & Deals",
    description: "Exclusive sign-up bonuses and referral rewards",
    longDescription:
      "Maximize your starting capital with our verified collection of the best crypto exchange sign-up bonuses. Updated monthly with exclusive referral codes and promotions.",
  },
  {
    slug: "audits",
    title: "Project Audits",
    description: "In-depth security and fundamentals analysis of crypto projects",
    longDescription:
      "Our project audits go beyond the whitepaper. We analyse smart contract security, tokenomics, team credibility, and on-chain activity to give you an honest, independent assessment before you invest.",
  },
]

export function getCategoryBySlug(slug: string): CategoryMeta | undefined {
  return categories.find((c) => c.slug === slug)
}
