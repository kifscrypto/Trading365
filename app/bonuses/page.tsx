import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Star, Shield, Zap, Gift, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { NewsletterCta } from "@/components/newsletter-cta"
import { ArticleCard } from "@/components/article-card"
import { exchanges } from "@/lib/data/exchanges"
import { getArticlesByCategoryFromDB } from "@/lib/data/articles-db"
import { generateItemListSchema, generateFAQSchema } from "@/lib/schema"

const BASE_URL = "https://www.trading365.org"
const OG_IMAGE = `${BASE_URL}/og-image.jpg`

export const metadata: Metadata = {
  title: "Best Crypto Exchange Sign-Up Bonuses (2026)",
  description:
    "Maximize your starting capital with verified crypto exchange sign-up bonuses. Exclusive referral codes and promotions updated monthly.",
  alternates: {
    canonical: `${BASE_URL}/bonuses`,
  },
  openGraph: {
    type: "website",
    title: "Best Crypto Exchange Sign-Up Bonuses (2026) | Trading365",
    description:
      "Maximize your starting capital with verified crypto exchange sign-up bonuses. Exclusive referral codes and promotions updated monthly.",
    url: `${BASE_URL}/bonuses`,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Best Crypto Exchange Bonuses 2026" }],
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Crypto Exchange Sign-Up Bonuses (2026) | Trading365",
    description:
      "Maximize your starting capital with verified crypto exchange sign-up bonuses. Exclusive referral codes and promotions updated monthly.",
    images: [OG_IMAGE],
  },
}

export default async function BonusesPage() {
  const bonusArticles = await getArticlesByCategoryFromDB("bonuses")
  const topExchanges = exchanges.filter(
    (e) => e.bonus && e.bonus !== "N/A"
  )

  const itemListSchema = generateItemListSchema(
    topExchanges.map((ex) => ({
      name: `${ex.name} — ${ex.bonus} Sign-Up Bonus`,
      url: ex.fullReview || `/bonuses`,
    }))
  )

  const bonusFAQs = [
    {
      question: "How do crypto exchange sign-up bonuses work?",
      answer: "Most crypto exchange sign-up bonuses are credited after you register via a referral link, make a qualifying deposit, and sometimes complete a minimum trading volume. The bonus is usually credited to your account within 24–72 hours of meeting the requirements.",
    },
    {
      question: "Are crypto exchange bonuses taxable?",
      answer: "In most jurisdictions, crypto bonuses are treated as income and are subject to tax in the year they are received. You should consult a tax professional in your country for specific guidance, as rules vary significantly between regions.",
    },
    {
      question: "Which crypto exchange has the best sign-up bonus right now?",
      answer: "As of 2026, WEEX and BYDFi offer the largest sign-up bonuses — up to $30,000 and $8,100 USDT respectively. The best deal depends on your deposit size and trading style. Use the comparison table above to find the right fit.",
    },
    {
      question: "Do I need to complete KYC to claim a bonus?",
      answer: "It depends on the exchange. Most bonuses on no-KYC exchanges like WEEX and BYDFi can be partially claimed without ID verification. However, the largest reward tiers and withdrawal of bonus funds may require completing KYC on most platforms.",
    },
    {
      question: "Can I withdraw a sign-up bonus immediately?",
      answer: "Usually not. Exchange bonuses typically come with a trading volume requirement before the bonus or profits from it can be withdrawn. Read the specific terms for each exchange before depositing.",
    },
  ]

  const faqSchema = generateFAQSchema(bonusFAQs)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 lg:px-6">
          <Breadcrumbs items={[{ label: "Bonuses & Deals" }]} />
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
                Best Crypto Exchange Bonuses
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Updated February 2026
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Maximize your starting capital with our verified collection of the best
            crypto exchange sign-up bonuses. All links below are exclusive referral
            codes that give you the highest available bonus.
          </p>
        </div>
      </section>

      {/* Bonus Cards Grid */}
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {topExchanges.map((exchange, i) => (
            <Card
              key={exchange.slug}
              className="group relative overflow-hidden border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              {i === 0 && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground font-semibold text-xs px-3 py-1">
                    Best Deal
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-foreground">
                    {exchange.name}
                  </CardTitle>
                  <div className="flex items-center gap-1 text-primary">
                    <Star className="h-4 w-4 fill-primary" />
                    <span className="text-sm font-bold">
                      {exchange.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Founded {exchange.founded} &middot; {exchange.headquarters}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Bonus Amount */}
                <div className="rounded-lg bg-primary/10 p-4 text-center">
                  <p className="text-xs font-medium text-primary/80 uppercase tracking-wider">
                    Sign-Up Bonus
                  </p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {exchange.bonus}
                  </p>
                </div>

                {/* Key Details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Leverage</span>
                    <span className="font-semibold text-foreground">
                      {exchange.leverage}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Trading Pairs</span>
                    <span className="font-semibold text-foreground">
                      {exchange.tradingPairs}+
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Maker Fee</span>
                    <span className="font-semibold text-foreground">
                      {exchange.fees.maker}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">KYC</span>
                    <span className="font-semibold text-foreground">
                      {exchange.kyc ? "Required" : "Not Required"}
                    </span>
                  </div>
                </div>

                {/* Highlights */}
                <ul className="flex flex-col gap-1.5">
                  {exchange.pros.slice(0, 4).map((pro, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                      {pro}
                    </li>
                  ))}
                </ul>

                {/* Bonus Details */}
                {exchange.bonusDetails && (
                  <p className="text-xs leading-relaxed text-muted-foreground border-t border-border pt-3">
                    {exchange.bonusDetails}
                  </p>
                )}

                {/* CTAs */}
                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href={exchange.referralLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="w-full gap-2 font-semibold" size="sm">
                      Claim Bonus
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  {exchange.fullReview && (
                    <Link href={exchange.fullReview}>
                      <Button
                        variant="outline"
                        className="w-full text-xs font-medium border-border text-muted-foreground hover:text-foreground"
                        size="sm"
                      >
                        Read Full Review
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick Comparison Table */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Bonus Comparison at a Glance
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Exchange
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Bonus
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    KYC
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Leverage
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Fees (Maker)
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-foreground">
                    Sign Up
                  </th>
                </tr>
              </thead>
              <tbody>
                {topExchanges.map((exchange) => (
                  <tr
                    key={exchange.slug}
                    className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {exchange.name}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {exchange.bonus}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {exchange.kyc ? (
                        <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">Required</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary">Not Required</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {exchange.leverage}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {exchange.fees.maker}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={exchange.referralLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" className="gap-1 text-xs font-semibold">
                          Claim
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How to Claim */}
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          How to Claim Your Bonus
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Zap,
              step: "1",
              title: "Click Our Referral Link",
              desc: "Use the exclusive links above to ensure you get the maximum bonus. Regular sign-ups often miss out on the best deals.",
            },
            {
              icon: Shield,
              step: "2",
              title: "Complete Registration",
              desc: "Create your account and complete any required steps. Most exchanges let you start trading with email verification only.",
            },
            {
              icon: Gift,
              step: "3",
              title: "Meet Bonus Requirements",
              desc: "Make your first deposit or complete the trading volume requirements. Bonuses are typically credited within 24 hours.",
            },
          ].map((item) => (
            <Card key={item.step} className="border-border bg-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Related Articles */}
      {bonusArticles.length > 0 && (
        <section className="border-t border-border bg-card/50">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Bonus Guides & Articles
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {bonusArticles.map((article) => (
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
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="mx-auto max-w-4xl px-4 py-12 lg:px-6">
        <h2 className="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {bonusFAQs.map((faq, i) => (
            <details key={i} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground list-none hover:bg-secondary/30 transition-colors">
                {faq.question}
                <span className="shrink-0 text-muted-foreground text-lg leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <NewsletterCta />
    </>
  )
}
