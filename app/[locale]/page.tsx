import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { isValidLocale, getLocale, LOCALE_CODES } from "@/lib/i18n/config"

const UI: Record<string, {
  description: string
  backToEnglish: string
  preparing: string
  viewEnglish: string
  categories: Record<string, string>
}> = {
  ru: {
    description: "Обзоры криптобирж, сравнения и эксклюзивные бонусы — на русском языке.",
    backToEnglish: "← Английская версия",
    preparing: "Контент на русском языке готовится. Заходите позже.",
    viewEnglish: "Смотреть на английском →",
    categories: { reviews: "обзоры", comparisons: "сравнения", "no-kyc": "без KYC", bonuses: "бонусы" },
  },
  es: {
    description: "Reseñas de exchanges de criptomonedas, comparaciones y bonos exclusivos — en español.",
    backToEnglish: "← Versión en inglés",
    preparing: "El contenido en español está siendo preparado. Vuelve pronto.",
    viewEnglish: "Ver contenido en inglés →",
    categories: { reviews: "reseñas", comparisons: "comparaciones", "no-kyc": "sin KYC", bonuses: "bonos" },
  },
  pt: {
    description: "Análises de exchanges de criptomoedas, comparações e bônus exclusivos — em português.",
    backToEnglish: "← Versão em inglês",
    preparing: "O conteúdo em português está sendo preparado. Volte em breve.",
    viewEnglish: "Ver conteúdo em inglês →",
    categories: { reviews: "análises", comparisons: "comparações", "no-kyc": "sem KYC", bonuses: "bônus" },
  },
  de: {
    description: "Krypto-Börsen-Reviews, Vergleiche und exklusive Boni — auf Deutsch.",
    backToEnglish: "← Englische Version",
    preparing: "Deutschsprachige Inhalte werden vorbereitet. Schauen Sie bald wieder vorbei.",
    viewEnglish: "Englische Inhalte ansehen →",
    categories: { reviews: "Reviews", comparisons: "Vergleiche", "no-kyc": "Ohne KYC", bonuses: "Boni" },
  },
  fr: {
    description: "Avis sur les exchanges crypto, comparaisons et offres de bonus exclusives — en français.",
    backToEnglish: "← Version anglaise",
    preparing: "Le contenu en français est en cours de préparation. Revenez bientôt.",
    viewEnglish: "Voir le contenu en anglais →",
    categories: { reviews: "avis", comparisons: "comparaisons", "no-kyc": "sans KYC", bonuses: "bonus" },
  },
  ja: {
    description: "暗号資産取引所のレビュー、比較、限定ボーナス — 日本語版。",
    backToEnglish: "← 英語版",
    preparing: "日本語コンテンツを準備中です。後日またご確認ください。",
    viewEnglish: "英語のコンテンツを見る →",
    categories: { reviews: "レビュー", comparisons: "比較", "no-kyc": "KYCなし", bonuses: "ボーナス" },
  },
  ko: {
    description: "암호화폐 거래소 리뷰, 비교 및 독점 보너스 — 한국어.",
    backToEnglish: "← 영어 버전",
    preparing: "한국어 콘텐츠를 준비 중입니다. 곧 돌아오세요.",
    viewEnglish: "영어 콘텐츠 보기 →",
    categories: { reviews: "리뷰", comparisons: "비교", "no-kyc": "KYC 없음", bonuses: "보너스" },
  },
  "zh-CN": {
    description: "加密货币交易所评测、对比和独家奖励 — 简体中文版。",
    backToEnglish: "← 英文版",
    preparing: "中文内容正在准备中，请稍后回来查看。",
    viewEnglish: "查看英文内容 →",
    categories: { reviews: "评测", comparisons: "对比", "no-kyc": "免KYC", bonuses: "奖励" },
  },
  "zh-TW": {
    description: "加密貨幣交易所評測、比較和獨家獎勵 — 繁體中文版。",
    backToEnglish: "← 英文版",
    preparing: "繁體中文內容正在準備中，請稍後回來查看。",
    viewEnglish: "查看英文內容 →",
    categories: { reviews: "評測", comparisons: "比較", "no-kyc": "免KYC", bonuses: "獎勵" },
  },
}

export async function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

const BASE_URL = 'https://trading365.org'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = getLocale(locale)
  if (!loc) return {}

  const hreflangAlternates: Record<string, string> = { 'x-default': BASE_URL, 'en': BASE_URL }
  for (const lc of LOCALE_CODES) hreflangAlternates[lc] = `${BASE_URL}/${lc}`

  return {
    title: `Trading365 — ${loc.name}`,
    description: `Crypto exchange reviews and comparisons in ${loc.fullName}.`,
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: hreflangAlternates,
    },
  }
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isValidLocale(locale)) notFound()

  const loc = getLocale(locale)!
  const ui = UI[locale] ?? {
    description: `Crypto exchange reviews, comparisons, and exclusive bonus deals — in ${loc.fullName}.`,
    backToEnglish: "← English version",
    preparing: `${loc.fullName} content is being prepared. Check back soon.`,
    viewEnglish: "View English content →",
    categories: {},
  }
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
            {ui.description}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            {ui.backToEnglish}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        {translations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">
              {ui.preparing}
            </p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
              {ui.viewEnglish}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {translations.map((t) => {
              const thumbnail = (t as any).thumbnail as string | null
              const categorySlug = (t as any).category_slug as string | undefined
              return (
                <Link
                  key={t.article_slug}
                  href={`/${locale}/${categorySlug}/${t.article_slug}`}
                  className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                >
                  {thumbnail && (
                    <div className="relative h-44 w-full">
                      <Image
                        src={thumbnail}
                        alt={t.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="p-5">
                    <p className="text-xs text-muted-foreground mb-2 capitalize">
                      {categorySlug ? (ui.categories[categorySlug] ?? categorySlug.replace("-", " ")) : ""}
                    </p>
                    <h2 className="font-semibold text-foreground line-clamp-2">{t.title}</h2>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.excerpt}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
