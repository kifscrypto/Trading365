import { siteConfig } from "@/lib/data/site-config"

interface ReviewSchemaProps {
  exchangeName: string
  ratingValue: number // 0–10 scale; converted to 0–5 internally
  reviewCount?: number
  description?: string
}

export function ReviewSchema({
  exchangeName,
  ratingValue,
  reviewCount = 1,
  description,
}: ReviewSchemaProps) {
  const rating5 = Math.round((ratingValue / 10) * 5 * 10) / 10

  const schema = {
    "@context": "https://schema.org",
    "@type": "Review",
    name: `${exchangeName} Review`,
    ...(description ? { description } : {}),
    author: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
    },
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: exchangeName,
      applicationCategory: "Cryptocurrency Exchange",
      operatingSystem: "Web",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating5,
        bestRating: 5,
        worstRating: 1,
        ratingCount: reviewCount,
      },
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: rating5,
      bestRating: 5,
      worstRating: 1,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
