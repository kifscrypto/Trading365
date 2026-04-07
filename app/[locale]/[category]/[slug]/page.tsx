import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { isValidLocale, getLocale, LOCALE_CODES } from "@/lib/i18n/config"
import { ArticleContent } from "@/components/article-content"
import { getExchangeBySlug } from "@/lib/data/exchanges"
import { ArrowLeft, Globe } from "lucide-react"

const BASE_URL = "https://www.trading365.org"

export async function generateMetadata({
  params,
}: {
  params: { locale: string; category: string; slug: string }
}): Promise<Metadata> {
  if (!isValidLocale(params.locale)) return {}

  const { getTranslation } = await import("@/lib/db")
  const translation = await getTranslation(params.slug, params.locale).catch(() => null)
  const loc = getLocale(params.locale)!

  const title = translation?.meta_title || translation?.title || params.slug
  const description = translation?.meta_description || translation?.excerpt || ""

  const hreflangAlternates: Record<string, string> = {
    "x-default": `${BASE_URL}/${params.category}/${params.slug}`,
    "en": `${BASE_URL}/${params.category}/${params.slug}`,
  }
  LOCALE_CODES.forEach((lc) => {
    hreflangAlternates[lc] = `${BASE_URL}/${lc}/${params.category}/${params.slug}`
  })

  return {
    title: `${title} | Trading365 ${loc.name}`,
    description,
    alternates: {
      canonical: `${BASE_URL}/${params.locale}/${params.category}/${params.slug}`,
      languages: hreflangAlternates,
    },
  }
}

export default async function LocaleArticlePage({
  params,
}: {
  params: { locale: string; category: string; slug: string }
}) {
  if (!isValidLocale(params.locale)) notFound()

  const loc = getLocale(params.locale)!

  const { getTranslation, getArticleBySlug } = await import("@/lib/db")
  const [translation, originalArticle] = await Promise.all([
    getTranslation(params.slug, params.locale).catch(() => null),
    getArticleBySlug(params.slug).catch(() => null),
  ])

  if (!translation) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-3">
            {loc.fullName} translation coming soon
          </h1>
          <p className="text-muted-foreground mb-6">
            This article hasn&apos;t been translated into {loc.fullName} yet.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href={`/${params.category}/${params.slug}`}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Read in English
            </Link>
            <Link
              href={`/${params.locale}`}
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              {loc.name} homepage
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const exchange = getExchangeBySlug(params.slug.replace("-review", ""))

  return (
    <main className="min-h-screen">
      <div className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-4xl px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{loc.flag}</span>
            <span>Reading in {loc.fullName}</span>
          </div>
          <Link href={`/${params.category}/${params.slug}`} className="text-xs text-primary hover:underline">
            Read in English →
          </Link>
        </div>
      </div>

      <article className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href={`/${params.locale}`}
          className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> {loc.name} home
        </Link>

        <header className="mb-8">
          <p className="text-xs text-muted-foreground mb-2 capitalize">
            {params.category.replace("-", " ")}
          </p>
          <h1 className="text-3xl font-bold text-foreground text-balance mb-4">
            {translation.title}
          </h1>
          <p className="text-lg text-muted-foreground">{translation.excerpt}</p>
          {originalArticle && (
            <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
              <span>{originalArticle.author}</span>
              <span>·</span>
              <span>{originalArticle.read_time}</span>
              {exchange && (
                <>
                  <span>·</span>
                  <span className="text-primary font-semibold">{exchange.rating}/10</span>
                </>
              )}
            </div>
          )}
        </header>

        <ArticleContent content={translation.content} />

        {exchange && (
          <div className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm font-semibold text-foreground mb-3">
              {translation.title.includes("Review")
                ? `Sign up for ${exchange.name}`
                : `Trade on ${exchange.name}`}
            </p>
            <a
              href={exchange.referralLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90"
            >
              {exchange.bonus} Bonus →
            </a>
          </div>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground mb-3">Available in other languages:</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${params.category}/${params.slug}`}
              className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:border-primary hover:text-primary"
            >
              🇬🇧 English
            </Link>
            {LOCALE_CODES.filter((lc) => lc !== params.locale).map((lc) => {
              const l = getLocale(lc)!
              return (
                <Link
                  key={lc}
                  href={`/${lc}/${params.category}/${params.slug}`}
                  className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {l.flag} {l.name}
                </Link>
              )
            })}
          </div>
        </div>
      </article>
    </main>
  )
}
