import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

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
import { Clock, Calendar, User, ArrowLeft, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { ProsConsList } from "@/components/pros-cons-list"
import { ArticleContent } from "@/components/article-content"
import { ArticleCard } from "@/components/article-card"
import { getCategoryBySlug } from "@/lib/data/categories"
import { getAllArticlesFromDB, getArticleBySlugFromDB, getArticlesByCategoryFromDB } from "@/lib/data/articles-db"
import { getExchangeBySlug } from "@/lib/data/exchanges"
import { getTranslatedLocalesForSlug } from "@/lib/db"
import { ShareButton } from "@/components/share-button"
import {
  generateArticleSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  toISODate,
} from "@/lib/schema"
import { ReviewSchema } from "@/components/review-schema"
import { slugifyHeading } from "@/lib/utils/heading"
import { ConversionCard } from "@/components/conversion-card"
import { StickyMobileCTA } from "@/components/sticky-mobile-cta"
import { ContextualSidebarBanner } from "@/components/contextual-sidebar-banner"
import { RegionalAlternativeCard } from "@/components/regional-alternative-card"
import { BottomMasterCTA } from "@/components/bottom-master-cta"
import { exchanges as allExchanges } from "@/lib/data/exchanges"

const RESTRICTED_RE = /restricted countries|blocked region|not available in|geo.?restrict|banned in|unavailable in/i

function splitAtRestricted(content: string): { before: string; after: string } | null {
  if (!RESTRICTED_RE.test(content)) return null
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (RESTRICTED_RE.test(lines[i])) {
      let end = i + 1
      while (end < lines.length && lines[end].trim() && !lines[end].startsWith('##')) end++
      return { before: lines.slice(0, end).join('\n'), after: lines.slice(end).join('\n') }
    }
  }
  return null
}

const BASE_URL = 'https://trading365.org'
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.png`

// Titles over ~60 chars get truncated in Google — override known long titles here
const TITLE_OVERRIDES: Record<string, string> = {
  // Do NOT append "| Trading365" here — the layout template does it automatically
  'weex-review': 'WEEX Exchange Review 2026: 400x Leverage & No-KYC',
  'what-is-kyc-crypto': 'What Is KYC in Crypto? 2026 Guide',
}

export async function getArticleMetadata(category: string, slug: string): Promise<Metadata> {
  const [article, translatedLocales] = await Promise.all([
    getArticleBySlugFromDB(slug),
    getTranslatedLocalesForSlug(slug).catch(() => [] as string[]),
  ])
  if (!article) return { title: 'Article Not Found' }

  const canonicalUrl = `${BASE_URL}/${category}/${slug}`
  // Thumbnails may be Vercel Blob URLs (already absolute) or relative paths
  const ogImage = article.thumbnail
    ? (article.thumbnail.startsWith('http') ? article.thumbnail : `${BASE_URL}${article.thumbnail}`)
    : OG_IMAGE
  const pageTitle = TITLE_OVERRIDES[slug] ?? article.metaTitle ?? article.title
  const pageDescription = article.metaDescription ?? article.excerpt

  const hreflangAlternates: Record<string, string> = {
    'x-default': canonicalUrl,
    'en': canonicalUrl,
  }
  for (const lc of translatedLocales) {
    hreflangAlternates[lc] = `${BASE_URL}/${lc}/${category}/${slug}`
  }

  return {
    title: pageTitle,
    description: pageDescription,
    keywords: article.metaKeywords ?? undefined,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },
    openGraph: {
      type: 'article',
      title: pageTitle,
      description: pageDescription,
      url: canonicalUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: pageTitle }],
      publishedTime: toISODate(article.date),
      modifiedTime: toISODate(article.updatedDate || article.date),
      authors: [article.author],
      siteName: 'Trading365',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: pageDescription,
      images: [ogImage],
    },
  }
}

/**
 * Remove the "Quick Facts" section from article content when the template
 * already renders it from exchange data — prevents the section appearing twice.
 */
function stripQuickFacts(content: string): string {
  // HTML (TipTap): find the Quick Facts h2 and remove it plus everything until the next h2
  if (/<[a-zA-Z]/.test(content)) {
    const match = content.match(/<h2[^>]*>[\s\S]*?Quick\s*Facts[\s\S]*?<\/h2>/i)
    if (!match || match.index === undefined) return content
    const start = match.index
    const afterSection = content.slice(start + match[0].length)
    const nextH2 = afterSection.search(/<h2/i)
    const end = nextH2 === -1 ? content.length : start + match[0].length + nextH2
    return content.slice(0, start) + content.slice(end)
  }
  // Markdown: split on ## headings and drop the Quick Facts section
  const sections = content.split(/(?=^## )/m)
  return sections.filter(s => !/^## Quick\s*Facts/i.test(s)).join('')
}

export default async function ArticlePageContent({ category, slug }: { category: string; slug: string }) {
  const article = await getArticleBySlugFromDB(slug)
  const cat = getCategoryBySlug(category)
  if (!article || !cat) notFound()

  // Try to get exchange data for review articles
  const exchangeSlug = slug.replace(/-review.*$/, "")
  const exchange = getExchangeBySlug(exchangeSlug)

  // Related articles (same category, excluding current)
  const allCategoryArticles = await getArticlesByCategoryFromDB(category)
  const related = allCategoryArticles
    .filter((a) => a.slug !== slug)
    .slice(0, 3)

  // Strip Quick Facts from content when the template card is already showing it
  const displayContent = exchange ? stripQuickFacts(article.content) : article.content

  // Extract h2 headings for TOC — supports both HTML (TipTap) and legacy Markdown
  const isHtml = /<[a-zA-Z]/.test(displayContent)
  const tocHeadings: { text: string; id: string }[] = isHtml
    ? [...displayContent.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => {
        const text = m[1].replace(/<[^>]+>/g, '').trim()
        return { text, id: slugifyHeading(text) }
      })
    : displayContent.split("\n\n")
        .filter((s) => s.startsWith("## "))
        .map((s) => {
          const text = s.replace("## ", "").split("\n")[0]
          return { text, id: slugifyHeading(text) }
        })
  // Keep legacy variable for non-TOC uses
  const sections = displayContent.split("\n\n")

  // Build contextual sidebar section links: map headings → exchange CTAs
  const sectionLinks = tocHeadings.flatMap(h => {
    const ex = allExchanges.find(e =>
      h.text.toLowerCase().includes(e.name.toLowerCase())
    )
    if (!ex) return []
    return [{ headingId: h.id, exchangeName: ex.name, ctaLink: ex.referralLink, label: "Maker Rebate — Activate Now" }]
  })

  // Derive primary CTA for conversion card + sticky banner
  const primaryCtaLink = exchange?.referralLink ?? "/bonuses"
  const primaryCtaText = exchange ? `Start Trading on ${exchange.name}` : "View Top Bonuses"
  const conversionPerks = exchange
    ? (article.pros?.length ? article.pros : (exchange.pros ?? [])).slice(0, 4)
    : ["0% maker fees on top exchanges", "Up to 400x leverage", "No-KYC required", "Exclusive sign-up bonuses"]
  const conversionTitle = exchange
    ? `${exchange.bonus} — Available via Trading365`
    : "Claim Exclusive Trading Bonuses"
  const savingsMetric = exchange?.bonus ?? "Exclusive Bonus"

  const articleSchema = generateArticleSchema(article, !!exchange)
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: cat.title, url: `/${category}` },
    { name: article.title },
  ])
  const faqSchema = article.faqs?.length ? generateFAQSchema(article.faqs) : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />
      {exchange && (
        <ReviewSchema
          exchangeName={exchange.name}
          ratingValue={article.rating || exchange.rating}
          description={article.excerpt}
        />
      )}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      {/* Header */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-4 pt-8 pb-8 lg:px-6">
          <Breadcrumbs
            items={[
              { label: cat.title, href: `/${category}` },
              { label: article.title },
            ]}
          />

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                {article.category}
              </Badge>
              {article.rating > 0 && (
                <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1">
                  <span className="text-sm font-bold text-primary">{article.rating}</span>
                  <span className="text-xs text-primary/70">/10</span>
                </div>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
              {article.title}
            </h1>

            <p className="text-base leading-relaxed text-muted-foreground max-w-2xl">
              {article.excerpt}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>By{" "}
                  <Link
                    href={`/authors/${article.author.toLowerCase().replace(/\s+/g, "-")}`}
                    className="hover:text-primary underline underline-offset-2 transition-colors"
                  >
                    {article.author}
                  </Link>
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Published {article.date}
              </span>
              {article.updatedDate && (
                <span className="flex items-center gap-1.5 font-medium text-primary/80">
                  <Clock className="h-3.5 w-3.5" />
                  Last Updated: {article.updatedDate}
                </span>
              )}
              <div className="ml-auto">
                <ShareButton url={`${BASE_URL}/${category}/${slug}`} title={article.title} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Image */}
      {article.thumbnail && (
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-4 py-8 lg:px-6">
          <div className="relative h-64 w-full overflow-hidden rounded-xl md:h-80 lg:h-96">
            <Image
              src={article.thumbnail}
              alt={article.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      )}

      {/* Content */}
      <article className="mx-auto max-w-4xl lg:max-w-6xl px-4 py-8 lg:px-6">
        <div className="flex flex-col gap-12 lg:flex-row">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Exchange Quick Facts (for reviews) */}
            {exchange && (
              <div className="mb-8 rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-lg font-semibold text-foreground">Quick Facts</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {[
                    { label: "Founded", value: exchange.founded },
                    { label: "HQ", value: exchange.headquarters },
                    { label: "Trading Pairs", value: `${exchange.tradingPairs}+` },
                    { label: "Maker Fee", value: exchange.fees.maker },
                    { label: "Taker Fee", value: exchange.fees.taker },
                    { label: "Min Deposit", value: exchange.minDeposit },
                    { label: "Withdrawal", value: exchange.withdrawalSpeed },
                    { label: "KYC Required", value: exchange.kyc ? "Yes" : "No" },
                    { label: "Bonus", value: exchange.bonus },
                  ].map((fact) => (
                    <div key={fact.label}>
                      <p className="text-xs text-muted-foreground">{fact.label}</p>
                      <p className="text-sm font-medium text-foreground">{fact.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <a
                    href={exchange.referralLink}
                    target="_blank"
                    rel="nofollow noopener noreferrer sponsored"
                  >
                    <Button className="gap-2 font-semibold" size="sm">
                      Visit {exchange.name}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {/* Pros/Cons — use DB values if present, otherwise fall back to exchange data */}
            {(article.pros?.length || article.cons?.length || exchange) && (
              <div className="mb-4">
                <ProsConsList
                  pros={article.pros?.length ? article.pros : (exchange?.pros ?? [])}
                  cons={article.cons?.length ? article.cons : (exchange?.cons ?? [])}
                />
              </div>
            )}

            {/* Conversion Card — injected after pros/cons */}
            <ConversionCard
              title={conversionTitle}
              savingsMetric={savingsMetric}
              perks={conversionPerks}
              ctaLink={primaryCtaLink}
              ctaText={primaryCtaText}
              exchangeName={exchange?.name}
            />

            {/* Article Body — with regional card injection and 400-word CTA */}
            {(() => {
              const isHtml = /<[a-zA-Z]/.test(displayContent)
              const split = !isHtml ? splitAtRestricted(displayContent) : null
              if (split) {
                return (
                  <>
                    <ArticleContent content={split.before} ctaLink={primaryCtaLink} />
                    <RegionalAlternativeCard blockedExchange={exchange?.name} />
                    <ArticleContent content={split.after} ctaLink={primaryCtaLink} />
                  </>
                )
              }
              return <ArticleContent content={displayContent} ctaLink={primaryCtaLink} />
            })()}

            {/* Verdict Closer — before FAQs */}
            <ConversionCard
              title={exchange ? `Make Your Move on ${exchange.name}` : "Ready to Act on the Research?"}
              savingsMetric={savingsMetric}
              perks={conversionPerks}
              ctaLink={primaryCtaLink}
              ctaText={primaryCtaText}
              exchangeName={exchange?.name}
            />

            {/* FAQ Section */}
            {article.faqs && article.faqs.length > 0 && (
              <div className="mt-10">
                <h2 className="text-2xl font-bold text-foreground mb-5">Frequently Asked Questions</h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                  {article.faqs.map((faq, i) => (
                    <details key={i} className="group">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground list-none hover:bg-secondary/30 transition-colors">
                        {faq.question}
                        <span className="shrink-0 text-muted-foreground text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                      </summary>
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                        <InlineMarkdown text={faq.answer} />
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {article.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Tags:</span>
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs border-border text-muted-foreground">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="sticky top-20 flex flex-col gap-6">
              {/* Contextual CTA — changes based on heading in viewport */}
              <ContextualSidebarBanner
                defaultCtaLink={primaryCtaLink}
                defaultCtaText={conversionTitle}
                sectionLinks={sectionLinks}
              />

              {/* Table of Contents */}
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">In this article</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {tocHeadings.map((h, i) => (
                    <li key={i}>
                      <a
                        href={`#${h.id}`}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>

        <Separator className="my-12 bg-border" />

        {/* Back Link */}
        <div className="mb-8">
          <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary" asChild>
            <Link href={`/${category}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to {cat.title}
            </Link>
          </Button>
        </div>

        {/* Related Articles */}
        {related.length > 0 && (
          <div>
            <h2 className="mb-6 text-xl font-bold text-foreground">Related Articles</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {related.map((a) => (
                <ArticleCard
                  key={a.slug}
                  title={a.title}
                  excerpt={a.excerpt}
                  category={a.category}
                  categorySlug={a.categorySlug}
                  slug={a.slug}
                  date={a.date}
                  readTime={a.readTime}
                  rating={a.rating}
                  thumbnail={a.thumbnail}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bottom Master CTA */}
        <div className="mt-12">
          <div className="flex items-center gap-4 mb-8">
            <Separator className="flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground shrink-0">Next Steps</span>
            <Separator className="flex-1 bg-border" />
          </div>
          <BottomMasterCTA />
        </div>
      </article>

      {/* Sticky mobile CTA — triggers at 30% scroll depth */}
      <StickyMobileCTA ctaLink={primaryCtaLink} />
    </>
  )
}
