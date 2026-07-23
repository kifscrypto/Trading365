import type { Metadata } from "next"
import { CompareClient } from "@/components/compare-client"
import { getMergedExchanges } from "@/lib/data/exchange-content"

// Recompute at most hourly so newly-reviewed exchanges and admin edits at
// /admin/exchanges surface without a redeploy.
export const revalidate = 3600

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
  // Full exchange pool = static built-ins + admin overrides + custom exchanges
  // auto-registered when a review is published + affiliate-link overrides.
  // getMergedExchanges falls back to static data if the DB is unavailable.
  const merged = await getMergedExchanges()
  // Only show exchanges with real comparison data. Auto-registered review stubs
  // (and brand-new /admin/exchanges rows) with no maker fee yet would otherwise
  // render as misleading empty "—"/"available nowhere" rows. Fill the row in
  // at /admin/exchanges and it appears automatically.
  const exchanges = merged.filter((e) => {
    if (e.defunct) return false
    const maker = (e.fees.maker ?? "").trim()
    return maker !== "" && maker !== "—"
  })

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
