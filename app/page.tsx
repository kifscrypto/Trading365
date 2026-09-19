export const revalidate = 300

import type { Metadata } from "next"
import { jsonLd } from "@/lib/utils/json-ld"
import Link from "next/link"
import { ArrowRight, Star, Zap, ShieldOff, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArticleCard } from "@/components/article-card"
import { CategoryCard } from "@/components/category-card"
import { ComparisonSpotlight } from "@/components/comparison-spotlight"
import { NewsletterCta } from "@/components/newsletter-cta"
import { TrustBar } from "@/components/trust-bar"
import { FeaturedAdvertisers } from "@/components/featured-advertisers"
import { PromoBanner } from "@/components/promo-banner"
import { getAllArticlesFromDB } from "@/lib/data/articles-db"
import { getScannerStats, getTrackedSignalCount, getCurrentRegime } from "@/lib/scanner-stats"
import { ScannerSpotlight } from "@/components/scanner-spotlight"
import { getFeaturedSlot } from "@/lib/data/featured"
import { TopPicks } from "@/components/top-picks"
import { getTopPicks } from "@/lib/data/top-picks"
import { generateWebsiteSchema } from "@/lib/schema"
import { buildHomeLanguages } from "@/lib/i18n/hreflang"
import { getArchiveStats, getArchivePage } from "@/lib/signals/public"
import { StatusStrip } from "@/components/home/status-strip"
import { Hero } from "@/components/home/hero"
import { BigStats, type StatItem } from "@/components/home/stat-cards"
import { LiveFeed } from "@/components/home/live-feed"
import { ResultMarquee } from "@/components/home/result-marquee"

const BASE_URL = 'https://trading365.org'

// hreflang links the homepage to the launched locale landings (reciprocal with
// their x-default → EN). See INDEXED_LOCALES in lib/i18n/config.
//
// The title is `absolute` on purpose: the root layout sets a
// '%s | Trading365' template, and a plain string here would render as
// "... | Trading365 | Trading365".
export const metadata: Metadata = {
  title: { absolute: 'AI Altcoin Scanner — Verified Signal Track Record | Trading365' },
  description:
    'Two AI altcoin scanners on perpetual futures. Every signal is published at fire time to a public archive — wins, losses, nothing deleted.',
  alternates: {
    canonical: BASE_URL,
    languages: buildHomeLanguages(),
  },
}

export default async function HomePage() {
  const allArticles = await getAllArticlesFromDB()

  // Editable via /admin/featured (falls back to the previous hardcoded lists).
  const [featuredSlugs, topPicks] = await Promise.all([
    getFeaturedSlot("featured_articles"),
    getTopPicks(),
  ])

  // Every live figure on this page comes from aggregates that already exist and
  // are already public:
  //   getArchiveStats / getArchivePage — the SAME functions and the same SQL the
  //     /signals archive renders. The homepage is a second view of one record,
  //     never a second calculation of it, so the two pages cannot disagree.
  //   getCurrentRegime — reads the market_condition the scanner itself wrote on
  //     its most recent scan rather than re-deriving the regime from price.
  //   getScannerStats / getTrackedSignalCount — unchanged, still feeding the
  //     relocated scanner spotlight and the tracked-signals figure.
  const [shortStats, longStats, trackedSignals, regime, archiveStats, archivePage] =
    await Promise.all([
      getScannerStats("short"),
      getScannerStats("long"),
      getTrackedSignalCount(),
      getCurrentRegime(),
      getArchiveStats(30),
      getArchivePage({ page: 1 }),
    ])

  // One query, three consumers. getArchivePage returns 25 rows newest-first;
  // the hero takes the newest, the feed the first six, the marquee a longer
  // slice. Slicing the same page is what guarantees the hero receipt, the feed
  // and the archive list can never show a different set of signals.
  const recent = archivePage.rows
  const heroReceipt = recent[0] ?? null
  const feedRows = recent.slice(0, 6)
  const marqueeRows = recent.slice(0, 18)

  // When this render happened, so the stats footer can report real staleness
  // instead of a written-in number. `revalidate` above bounds it at 5 minutes.
  const renderedAt = Date.now()

  const featuredArticles = featuredSlugs.length > 0
    ? featuredSlugs
        .map((slug) => allArticles.find((a) => a.slug === slug))
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .slice(0, 6)
    : allArticles.slice(0, 6)
  const reviewCount = allArticles.filter((a) => a.categorySlug === "reviews").length
  const comparisonCount = allArticles.filter((a) => a.categorySlug === "comparisons").length
  const noKycCount = allArticles.filter((a) => a.categorySlug === "no-kyc").length
  const guidesCount = allArticles.filter((a) => a.categorySlug === "guides").length

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
      description: "Trade without identity verification",
      href: "/no-kyc",
      icon: ShieldOff,
      count: noKycCount,
    },
    {
      title: "Guides",
      description: "Step-by-step walkthroughs for trading and getting started",
      href: "/guides",
      icon: BookOpen,
      count: guidesCount,
    },
  ]

  // The scanner stat is READ, not written. It was "23,000+" while the table
  // already held 61,279 rows — understating the record by 38k and contradicting
  // this page's own ScannerSpotlight, which counted the same table. Flooring it
  // to the nearest 1,000 keeps the "+" strictly true between revalidations, so
  // it can only ever be raised by the next deploy of data, never by editing this
  // file. The written fallback is for an unreachable database only, and is the
  // old conservative claim, so a failed query cannot inflate the figure.
  const trackedClaim = trackedSignals !== null
    ? `${(Math.floor(trackedSignals / 1000) * 1000).toLocaleString("en-US")}+`
    : "23,000+"

  // The three headline cards. A null value renders an em dash rather than a
  // zero, so an empty or unreachable archive can never be presented as "0%".
  const statItems: StatItem[] = [
    {
      label: "Hit rate — last 30 days",
      value: archiveStats.hitRate,
      format: "pct",
      sub: archiveStats.resolved > 0
        ? `${archiveStats.wins} of ${archiveStats.resolved} resolved`
        : "awaiting first resolution",
      primary: true,
    },
    {
      label: "Net expectancy / signal",
      value: archiveStats.netExpectancy,
      format: "pct",
      tag: `After ${archiveStats.netRoundTripPct.toFixed(2)}% round trip`,
    },
    {
      label: "Receipts published",
      // archivePage.total is the all-time published count — the same figure the
      // archive's "signals published in total" line shows.
      value: archivePage.total > 0 ? archivePage.total : null,
      format: "int",
      tag: "0 deleted",
    },
  ]

  return (
    <div className="t365">
      {/* Scanline texture + the two green radial glows. Purely decorative and
          behind everything, so it is the first thing in the DOM and carries no
          accessible content. */}
      <div className="t365-texture z-0" aria-hidden="true" />

      {/* WebSite schema. Organization schema is emitted sitewide from the root
          layout. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(generateWebsiteSchema()) }}
      />

      {/* Content sits above the texture. `relative z-10` is what lifts it; the
          sticky site header (z-50, outside this wrapper) still paints on top. */}
      <div className="relative z-10">
        {/* 1. Status strip — is the scanner running, and in what regime */}
        <StatusStrip regime={regime} />

        {/* 2/3. Hero and the verified receipt it carries */}
        <Hero receipt={heroReceipt} />

        {/* 4. The three headline numbers, all from the public archive's own
            aggregates */}
        <section className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
          <BigStats items={statItems} renderedAt={renderedAt} />
        </section>

        {/* 5. Latest results. Same query as the archive, just limited — losses
            appear here exactly as winners do. */}
        <section className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight text-[var(--t-tx)] sm:text-xl">
              Latest results — published as they close
            </h2>
            <Link
              href="/signals"
              className="font-mono text-[11px] tracking-wider t-dim hover:text-[var(--t-green)]"
            >
              Full archive →
            </Link>
          </div>
          <div className="mt-4">
            <LiveFeed rows={feedRows} />
          </div>
        </section>

        {/* ── Everything below is the previous homepage, kept and relocated ──
            These are the same components the old page rendered, in a new order.
            They are restyled only through the token remap in globals.css
            (.t365-legacy), so no shared component was edited and no page outside
            the homepage is affected. Every internal link they carry survives:
            the two scanners, the partner venues, the featured reviews, the
            comparisons block, the five category hubs, Discord and the newsletter.

            Note which ones bring their own <section> wrapper — the comparisons
            spotlight, the advertisers strip, the newsletter and the trust bar —
            and which do not. The ones that do are placed unwrapped so their
            padding is not doubled. */}
        <div className="t-theme">
          {/* The two scanners in detail. This carried the hero before; now it
              supports the claim above instead of being the whole page. */}
          <ScannerSpotlight short={shortStats} long={longStats} />

          {/* The site-wide tracked figure, still READ from the database rather
              than written in — it read "23,000+" while the table already held
              61,279 rows. Floored to the nearest 1,000 so the "+" stays strictly
              true for the whole revalidation window. */}
          <p className="mx-auto -mt-4 max-w-5xl px-4 text-center font-mono text-[11px] tracking-wider text-muted-foreground lg:px-6">
            {trackedClaim} scanner signals tracked across both books
          </p>

          {/* 6a. Partner venues — the answer to "where do I actually trade this?" */}
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                  Partner venues
                </Badge>
                <h2 className="text-2xl font-bold text-foreground text-balance">
                  Where to execute them — partner venues we review
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  The exchanges the scanners cover, and where the signals are tradeable.
                </p>
              </div>
            </div>
            <div className="mt-8">
              <TopPicks picks={topPicks} />
            </div>
          </section>

          {/* 6b. Featured reviews — three cards, all linking to /reviews/* */}
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                  Latest
                </Badge>
                <h2 className="text-2xl font-bold text-foreground text-balance">
                  Featured reviews &amp; guides
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
              {featuredArticles.slice(0, 3).map((article) => (
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

          {/* 6c. Comparisons — brings its own section wrapper */}
          <ComparisonSpotlight />

          {/* Advertiser strip and promo banner — kept, moved below the content */}
          <FeaturedAdvertisers />
          <PromoBanner />

          {/* 6d. Category hubs — five internal links, all preserved */}
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground text-balance">
                Explore by category
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
            {/* /compare lost its old hero button, so it keeps an internal link
                here rather than becoming homepage-orphaned. */}
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Or{' '}
              <Link href="/compare" className="text-primary underline hover:opacity-80">
                compare any two exchanges side by side
              </Link>
              .
            </p>
          </section>

          {/* 6e. Email capture — brings its own section wrapper */}
          <NewsletterCta />

          {/* Trust bar — brings its own section wrapper */}
          <TrustBar />
        </div>

        {/* 7. Ticker footer — a thin marquee of the same resolved rows, looping
            slowly. CSS-only and killed by prefers-reduced-motion. */}
        <ResultMarquee rows={marqueeRows} />
      </div>
    </div>
  )
}
