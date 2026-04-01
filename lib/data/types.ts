export interface Exchange {
  slug: string
  name: string
  logo?: string
  rating: number
  fees: { maker: string; taker: string }
  kyc: boolean
  kycNote?: string
  bonus: string
  bonusDetails: string
  referralLink: string
  founded: string
  headquarters: string
  tradingPairs: number
  leverage?: string
  minDeposit: string
  withdrawalSpeed: string
  securityFeatures: string[]
  pros: string[]
  cons: string[]
  summary: string
  fullReview: string
  category: string
  copyTrading?: boolean
  vipProgram?: boolean
}

export interface Article {
  slug: string
  title: string
  excerpt: string
  content: string
  category: ArticleCategory
  categorySlug: string
  date: string
  updatedDate?: string
  readTime: string
  author: string
  rating?: number
  thumbnail?: string
  tags: string[]
  faqs?: { question: string; answer: string }[]
  metaTitle?: string
  metaDescription?: string
  metaKeywords?: string
}

export interface Comparison {
  slug: string
  title: string
  excerpt: string
  exchange1: string
  exchange2: string
  date: string
  readTime: string
  thumbnail?: string
  content: string
}

export type ArticleCategory = "Reviews" | "Comparisons" | "No-KYC" | "Bonuses"

export interface CategoryMeta {
  slug: string
  title: string
  description: string
  longDescription: string
}

export interface SiteConfig {
  name: string
  description: string
  url: string
  socials: {
    facebook: string
    twitter: string
    youtube: string
    telegram: string
    discord: string
  }
}
