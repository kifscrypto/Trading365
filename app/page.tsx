export const revalidate = 300

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Star, Zap, ShieldOff, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BonusCard } from "@/components/bonus-card"
import { ArticleCard } from "@/components/article-card"
import { CategoryCard } from "@/components/category-card"
import { ComparisonSpotlight } from "@/components/comparison-spotlight"
import { NewsletterCta } from "@/components/newsletter-cta"
import { TrustBar } from "@/components/trust-bar"
import { FeaturedAdvertisers } from "@/components/featured-advertisers"
import { PromoBanner } from "@/components/promo-banner"
import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { exchanges } from "@/lib/data/exchanges"
import { generateWebsiteSchema, generateOrganizationStandaloneSchema } from "@/lib/schema"
import { LOCALE_CODES } from "@/lib/i18n/config"

const BASE_URL = 'https://trading365.org'

const _hreflangAlternates: Record<string, string> = { 'x-default': BASE_URL, 'en': BASE_URL }
for (const lc of LOCALE_CODES) _hreflangAlternates[lc] = `${BASE_URL}/${lc}`

export const metadata: Metadata = {
  alternates: {
    canonical: BASE_URL,
    languages: _hreflangAlternates,
  },
}

const DEAL_ORDER = ["novava-crypto-exchange", "bydfi", "bitunix"]
const topExchanges = DEAL_ORDER.map((slug) => exchanges.find((e) => e.slug === slug)!).filter(Boolean)
const bonusDeals = topExchanges.map((ex, i) => ({
  name: ex.name,
  bonus: ex.bonus,
  features: ex.pros.slice(0, 4),
  tag: i === 0 ? "Best Deal" : undefined,
  referralLink: ex.referralLink,
}))

export default async function HomePage() {
  const allArticles = await getAllArticlesFromDB()
  const featuredArticles = allArticles.slice(0, 6)
  const reviewCount = allArticles.filter((a) => a.categorySlug === "reviews").length
  const comparisonCount = allArticles.filter((a) => a.categorySlug === "comparisons").length
  const noKycCount = allArticles.filter((a) => a.categorySlug === "no-kyc").length
  const bonusCount = allArticles.filter((a) => a.categorySlug === "bonuses").length

  const categories = [
    {
      title: "Exchange Reviews",
      description: "In-depth analysis of major crypto trading platforms",
      href: "/reviews",
      icon: Star,
      count: reviewCount,
    },
    {
      title: "Comparisons",
      description: "Side-by-side exchange matchups to find your best fit",
      href: "/comparisons",
      icon: Zap,
      count: comparisonCount,
    },
    {
      title: "No-KYC Exchanges",
      description: "Trade without identity verification requirements",
      href: "/no-kyc",
      icon: ShieldOff,
      count: noKycCount,
    },
    {
      title: "Bonuses & Deals",
      description: "Exclusive sign-up bonuses and referral rewards",
      href: "/bonuses",
      icon: Gift,
      count: bonusCount,
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateWebsiteSchema()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateOrganizationStandaloneSchema()),
        }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.8_0.15_85/0.06),transparent_60%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 pt-20 pb-16 text-center lg:px-6 lg:pt-28 lg:pb-20">
          <Link href="/" className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo-wide.png"
              alt="Trading365 - Trade Smarter. Earn Bigger."
              width={280}
              height={70}
              className="mx-auto"
              style={{ width: "280px", height: "auto" }}
            />
          </Link>
          <Badge variant="outline" className="mb-6 border-primary/30 text-primary">
            Trusted by 50,000+ traders worldwide
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl text-balance">
            Trade Smarter.{" "}
            <span className="text-primary">Earn Bigger.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Expert crypto exchange reviews, unbiased comparisons, and exclusive bonus deals to maximize your trading profits.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="gap-2 font-semibold px-8" asChild>
              <Link href="/reviews">
                Browse Reviews
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="font-semibold px-8 border-primary/30 text-foreground hover:bg-primary/10" asChild>
              <Link href="/compare">Compare Exchanges</Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid w-full max-w-lg grid-cols-3 gap-8">
            {[
              { value: "50+", label: "Exchanges Reviewed" },
              { value: "$2M+", label: "In Bonuses Listed" },
              { value: "50K+", label: "Monthly Readers" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold text-primary md:text-3xl">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Advertisers */}
      <FeaturedAdvertisers />

      {/* Top Bonus Deals */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 text-primary border-primary/30">
              Exclusive Deals
            </Badge>
            <h2 className="text-2xl font-bold text-foreground text-balance">
              Top Sign-Up Bonuses
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Verified and updated weekly. Claim before they expire.
            </p>
          </div>
          <Button variant="ghost" className="gap-2 text-primary hover:text-primary" asChild>
            <Link href="/bonuses">
              View all deals
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {bonusDeals.map((deal) => (
            <BonusCard key={deal.name} {...deal} />
          ))}
        </div>
      </section>

      {/* Rotating Promo Banner */}
      <PromoBanner />

      {/* Featured Reviews with Thumbnails */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 text-primary border-primary/30">
              Latest
            </Badge>
            <h2 className="text-2xl font-bold text-foreground text-balance">
              Featured Reviews & Guides
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              In-depth analysis to help you make informed trading decisions.
            </p>
          </div>
          <Button variant="ghost" className="gap-2 text-primary hover:text-primary" asChild>
            <Link href="/reviews">
              View all articles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featuredArticles.map((article) => (
            <ArticleCard
              key={article.slug}
              title={article.title}
              excerpt={article.excerpt}
              category={article.category}
              categorySlug={article.categorySlug}
              slug={article.slug}
              date={article.date}
              readTime={article.readTime}
              rating={article.rating}
              thumbnail={article.thumbnail}
            />
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <ComparisonSpotlight />

      {/* Category Cards */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground text-balance">
            Explore by Category
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Find exactly what you need, fast.
          </p>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => (
            <CategoryCard key={cat.href} {...cat} />
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <NewsletterCta />

      {/* Trust Bar */}
      <TrustBar />
    </>
  )
}
