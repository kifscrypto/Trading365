import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { isValidLocale, getLocale, LOCALE_CODES } from "@/lib/i18n/config"

export async function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = getLocale(locale)
  if (!loc) return {}
  return {
    title: `Trading365 — ${loc.name}`,
    description: `Crypto exchange reviews and comparisons in ${loc.fullName}.`,
    alternates: { canonical: `https://www.trading365.org/${locale}` },
  }
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isValidLocale(locale)) notFound()

  const loc = getLocale(locale)!
  let translations: { article_slug: string; title: string; excerpt: string; category_slug?: string }[] = []

  try {
    const { getAllTranslationsForLocale } = await import("@/lib/db")
    translations = await getAllTranslationsForLocale(locale)
  } catch {
    // DB unavailable or table not yet created
  }

  return (
    <main className="min-h-screen">
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">{loc.flag}</span>
            <h1 className="text-3xl font-bold text-foreground">
              Trading365 — {loc.name}
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Crypto exchange reviews, comparisons, and exclusive bonus deals — in {loc.fullName}.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← English version
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        {translations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">
              {loc.fullName} content is being prepared. Check back soon.
            </p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
              View English content →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {translations.map((t) => (
              <Link
                key={t.article_slug}
                href={`/${locale}/${t.category_slug}/${t.article_slug}`}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
              >
                <p className="text-xs text-muted-foreground mb-2 capitalize">
                  {t.category_slug?.replace("-", " ")}
                </p>
                <h2 className="font-semibold text-foreground line-clamp-2">{t.title}</h2>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
