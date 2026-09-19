import type { Metadata, Viewport } from 'next'
import { jsonLd } from '@/lib/utils/json-ld'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { GoogleAnalytics } from '@/components/google-analytics'
import { PageTracker } from '@/components/page-tracker'
import { AffiliateClickTracker } from '@/components/affiliate-click-tracker'
import { generateOrganizationStandaloneSchema } from '@/lib/schema'
import { ExitIntentPopup } from '@/components/exit-intent-popup'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

const BASE_URL = 'https://trading365.org'
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.jpg`

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}

// The site identity is SCANNER-FIRST, and this block is the root cause of the
// split identity the site had: every page body said "signal scanner" while the
// metadata said "exchange reviews". Pages override `title` and `description`
// but almost none override `openGraph`/`twitter`, and Next inherits those from
// here — so this object was deciding the social identity of the whole site.
//
// Review keywords are kept on purpose. /reviews, /comparisons and /bonuses are
// real traffic with real link equity; a title that drops "exchange reviews"
// entirely would strand them. Scanner leads, reviews follow.
//
// NO HIT-RATE NUMBERS IN TITLES. A number in a title is a claim that goes stale
// the moment the archive moves, and a stale number beside a public archive that
// publishes the real one is an inflated claim. Numbers belong in the body, read
// from the database, or on the OG card, regenerated from the same source.
const SITE_TITLE = 'Trading365 — Live Crypto Signal Scanner & Exchange Reviews'
const SITE_DESCRIPTION =
  '62,000+ signals tracked, every result published at fire time. Live AI altcoin signal scanners, plus independent crypto exchange reviews and bonuses.'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Trading365',
  },
  description: SITE_DESCRIPTION,
  // meta keywords intentionally omitted — ignored by Google, leaks targeting.
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: 'website',
    siteName: 'Trading365',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: BASE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Trading365 — live crypto signal scanner with a public, verified track record' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@trading365x',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="naver-site-verification" content="1790ce3ad7df54aff5e6fd5ac1c784a6c5da2264" />
        {/* Sitewide Organization schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(generateOrganizationStandaloneSchema()) }}
        />
        <link rel="alternate" type="application/rss+xml" title="Trading365 RSS Feed" href="/feed.xml" />
        <link rel="alternate" type="text/plain" title="Trading365 LLM Index" href="/llms.txt" />
        <link rel="alternate" type="text/plain" title="Trading365 LLM Full Dataset" href="/llms-full.txt" />
      </head>
      <GoogleAnalytics />
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <PageTracker />
        <AffiliateClickTracker />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <ExitIntentPopup />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
