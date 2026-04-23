import type { Article, Exchange } from "@/lib/data/types"
import { siteConfig } from "@/lib/data/site-config"

const BASE_URL = siteConfig.url

/**
 * Convert a loose date string like "Sep 15, 2025" or "Feb 2026" to ISO 8601.
 * Returns the original string if it is already valid ISO (e.g. "2025-09-15").
 */
export function toISODate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  // Already ISO-like (starts with 4-digit year)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr).toISOString()
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()
  // Month-year only: "Feb 2026"
  const monthYear = new Date(`1 ${dateStr}`)
  if (!isNaN(monthYear.getTime())) return monthYear.toISOString()
  return new Date().toISOString()
}

export function generateWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    description: siteConfig.description,
    url: BASE_URL,
    publisher: generateOrganizationSchema(),
    // SearchAction omitted — no functional search endpoint exists
  }
}

// Used as a nested object inside other schemas (no @context)
export function generateOrganizationSchema() {
  return {
    "@type": "Organization",
    name: siteConfig.name,
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo-wide.png`,
    sameAs: [
      siteConfig.socials.facebook,
      siteConfig.socials.twitter,
      siteConfig.socials.youtube,
      siteConfig.socials.telegram,
    ].filter(Boolean),
  }
}

// Standalone Organization schema for homepage (with @context)
export function generateOrganizationStandaloneSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo-wide.png`,
    description: siteConfig.description,
    sameAs: [
      siteConfig.socials.facebook,
      siteConfig.socials.twitter,
      siteConfig.socials.youtube,
      siteConfig.socials.telegram,
    ].filter(Boolean),
  }
}

export function generateItemListSchema(
  items: { name: string; url: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  }
}

export function generateArticleSchema(article: Article, isReview = false) {
  return {
    "@context": "https://schema.org",
    "@type": isReview ? "ReviewNewsArticle" : "Article",
    headline: article.title,
    description: article.excerpt,
    image: article.thumbnail ? `${BASE_URL}${article.thumbnail}` : undefined,
    datePublished: toISODate(article.date),
    dateModified: toISODate(article.updatedDate || article.date),
    author: {
      "@type": "Person",
      name: article.author,
    },
    publisher: generateOrganizationSchema(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/${article.categorySlug}/${article.slug}`,
    },
  }
}

export function generateReviewSchema(article: Article, exchange: Exchange) {
  const rawRating = article.rating || exchange.rating
  const rating5 = Math.round((rawRating / 10) * 5 * 10) / 10
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    name: article.title,
    description: article.excerpt,
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: exchange.name,
      applicationCategory: "Cryptocurrency Exchange",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: rating5,
      bestRating: 5,
      worstRating: 1,
    },
    author: {
      "@type": "Organization",
      name: siteConfig.name,
      url: BASE_URL,
    },
    publisher: generateOrganizationSchema(),
    datePublished: toISODate(article.date),
    dateModified: toISODate(article.updatedDate || article.date),
    reviewBody: article.excerpt,
    url: `${BASE_URL}/${article.categorySlug}/${article.slug}`,
  }
}

export function generateBreadcrumbSchema(
  items: { name: string; url?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: BASE_URL,
      },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.name,
        ...(item.url ? { item: `${BASE_URL}${item.url}` } : {}),
      })),
    ],
  }
}

export function generateFAQSchema(
  questions: { question: string; answer: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  }
}
