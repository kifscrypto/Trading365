import type { Metadata } from "next"
import { CompareClient } from "@/components/compare-client"
import { exchanges as baseExchanges } from "@/lib/data/exchanges"
import { sql } from "@/lib/db"

const BASE_URL = "https://trading365.org"
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.jpg`

const webApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Crypto Exchange Comparison Tool",
  url: `${BASE_URL}/compare`,
  description: "Compare crypto exchanges side-by-side on fees, leverage, KYC requirements and bonuses.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  provider: {
    "@type": "Organization",
    name: "Trading365",
    url: BASE_URL,
  },
}

export const metadata: Metadata = {
  title: "Crypto Exchange Comparison Tool",
  description:
    "Compare crypto exchanges side-by-side on fees, leverage, KYC requirements and bonuses. Find your best fit in seconds.",
  alternates: {
    canonical: `${BASE_URL}/compare`,
  },
  openGraph: {
    type: "website",
    title: "Crypto Exchange Comparison Tool | Trading365",
    description:
      "Compare crypto exchanges side-by-side on fees, leverage, KYC requirements and bonuses. Find your best fit in seconds.",
    url: `${BASE_URL}/compare`,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Exchange Comparison Tool" }],
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "Crypto Exchange Comparison Tool | Trading365",
    description:
      "Compare crypto exchanges side-by-side on fees, leverage, KYC requirements and bonuses. Find your best fit in seconds.",
    images: [OG_IMAGE],
  },
}

export default async function ComparePage() {
  // Merge DB referral link overrides on top of the hardcoded exchange data
  let exchanges = baseExchanges
  try {
    const rows = await sql`SELECT slug, affiliate_url FROM affiliate_links`
    if (rows.length > 0) {
      const overrides = Object.fromEntries(rows.map((r) => [r.slug as string, r.affiliate_url as string]))
      exchanges = baseExchanges.map((e) =>
        overrides[e.slug] ? { ...e, referralLink: overrides[e.slug] } : e
      )
    }
  } catch {
    // DB unavailable — fall back to static data silently
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
      />
      <CompareClient exchanges={exchanges} />
    </>
  )
}
