import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { ArticleCard } from "@/components/article-card"
import { NewsletterCta } from "@/components/newsletter-cta"
import { getCategoryBySlug } from "@/lib/data/categories"
import { getArticlesByCategoryFromDB } from "@/lib/data/articles-db"
import { generateBreadcrumbSchema, generateItemListSchema, generateFAQSchema } from "@/lib/schema"

/** Render a string that may contain [text](href) markdown links as JSX */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (match) {
          return (
            <Link key={i} href={match[2]} className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
              {match[1]}
            </Link>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

const BASE_URL = 'https://trading365.org'
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.png`

// Expanded descriptions (130–155 chars) for categories with previously short descriptions
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  reviews: 'In-depth crypto exchange reviews covering fees, leverage, KYC requirements, bonuses, and security. Find the best platform for your trading style.',
  comparisons: 'Side-by-side crypto exchange comparisons to find your best fit. We compare fees, leverage, KYC rules, and bonuses so you don\'t have to.',
  'no-kyc': 'Find the best no-KYC crypto exchanges in 2026. Trade crypto without ID verification — compare fees, leverage, and bonuses on platforms that respect your privacy.',
}

export async function getCategoryMetadata(category: string): Promise<Metadata> {
  const cat = getCategoryBySlug(category)
  if (!cat) return { title: 'Category Not Found' }

  const canonicalUrl = `${BASE_URL}/${category}`
  const description = DESCRIPTION_OVERRIDES[category] ?? cat.description
  const ogImage = `${BASE_URL}/api/og?${new URLSearchParams({ title: cat.title, category: 'Trading365' })}`

  return {
    title: cat.title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      title: `${cat.title} | Trading365`,
      description,
      url: canonicalUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: cat.title }],
      siteName: 'Trading365',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cat.title} | Trading365`,
      description,
      images: [OG_IMAGE],
    },
  }
}

const CATEGORY_FAQS: Record<string, { question: string; answer: string }[]> = {
  "no-kyc": [
    { question: "Is it legal to use a no-KYC crypto exchange?", answer: "In most countries it is legal to use a no-KYC exchange for personal trading, though regulations vary. Some jurisdictions require exchanges to collect identity data above certain withdrawal thresholds. Always check the laws in your country before trading." },
    { question: "What are the withdrawal limits on no-KYC exchanges?", answer: "Limits vary by exchange. Most no-KYC platforms allow withdrawals of up to 2 BTC per day without ID verification. Larger withdrawals typically require at least basic KYC such as a selfie or government ID." },
    { question: "Are no-KYC exchanges safe?", answer: "The top no-KYC exchanges use the same security infrastructure as KYC platforms — cold storage, 2FA, and proof-of-reserves. The key risk is regulatory: a no-KYC exchange may face restrictions or shutdowns. Stick to established platforms with a proven track record." },
    { question: "Which no-KYC exchange has the highest leverage?", answer: "WEEX offers the highest leverage among no-KYC exchanges at up to 400x on crypto futures. BYDFi follows with up to 200x. High leverage carries significant risk and is not suitable for all traders." },
  ],
  reviews: [
    { question: "How does Trading365 review crypto exchanges?", answer: "We create real accounts, deposit real funds, and test every feature firsthand. Our standardized six-step methodology covers account creation, trading, security, fees, UX, and support. You can read the full methodology on our About page." },
    { question: "Are Trading365 reviews independent?", answer: "Yes. We are not owned by or affiliated with any exchange. We may earn affiliate commissions when you sign up via our links, but this never influences our ratings or rankings. Our editorial policy is published on the About page." },
    { question: "How often are reviews updated?", answer: "We review and update exchange ratings at least every six months, and immediately when a significant fee change, security incident, or policy update occurs. Each review shows the last updated date clearly." },
    { question: "What is the highest-rated exchange on Trading365?", answer: "As of 2026, WEEX holds the highest overall rating at 8.8/10, followed by BYDFi at 8.5/10. Ratings are based on our composite scoring system covering fees, leverage, security, UX, and bonuses." },
  ],
  comparisons: [
    { question: "How do I choose between two crypto exchanges?", answer: "Focus on three factors: fees (maker/taker and withdrawal), leverage if you trade futures, and whether KYC is required for your trading volume. Use our comparison tool at /compare to run a side-by-side analysis in seconds." },
    { question: "What is the safest crypto exchange in 2026?", answer: "Safety depends on several factors: regulatory compliance, cold storage ratio, security audit history, and proof-of-reserves. Among the exchanges we review, CoinEx has the longest clean security track record since 2017." },
    { question: "Is it better to use a CEX or DEX for trading?", answer: "CEXs (centralised exchanges) offer higher liquidity, tighter spreads, and more features like leverage trading. DEXs offer more privacy and self-custody. For active trading, a CEX is almost always the better choice." },
  ],
}

export default async function CategoryPageContent({ category }: { category: string }) {
  const cat = getCategoryBySlug(category)
  if (!cat) notFound()

  const categoryArticles = await getArticlesByCategoryFromDB(category)
  const faqs = CATEGORY_FAQS[category] ?? []

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: cat.title, url: `/${category}` },
  ])

  const itemListSchema = generateItemListSchema(
    categoryArticles.map((a) => ({
      name: a.title,
      url: `/${category}/${a.slug}`,
    }))
  )

  const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs) : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(itemListSchema),
        }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 lg:px-6">
          <Breadcrumbs items={[{ label: cat.title }]} />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
            {cat.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            <InlineMarkdown text={cat.longDescription} />
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        {categoryArticles.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categoryArticles.map((article) => (
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
        ) : (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-lg font-medium text-foreground">No articles yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check back soon for new content in this category.
            </p>
          </div>
        )}
      </section>

      {faqs.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-12 lg:px-6">
          <h2 className="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {faqs.map((faq, i) => (
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
      )}

      <NewsletterCta />
    </>
  )
}
