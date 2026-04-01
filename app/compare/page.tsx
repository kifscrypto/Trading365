import type { Metadata } from "next"
import { CompareClient } from "@/components/compare-client"

const BASE_URL = "https://www.trading365.org"
const OG_IMAGE = `${BASE_URL}/og-image.jpg`

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

export default function ComparePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
      />
      <CompareClient />
    </>
  )
}
