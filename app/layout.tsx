import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { GoogleAnalytics } from '@/components/google-analytics'
import { PartnerPixels } from '@/components/partner-pixels'
import { PageTracker } from '@/components/page-tracker'
import { ExitIntentPopup } from '@/components/exit-intent-popup'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

const BASE_URL = 'https://trading365.org'
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.png`

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Trading365 - Trade Smarter. Earn Bigger.',
    template: '%s | Trading365',
  },
  description: 'Expert crypto exchange reviews, comparisons, and exclusive bonus deals. Find the best trading platforms with unbiased analysis and real user insights.',
  keywords: ['crypto exchange', 'bitcoin trading', 'exchange reviews', 'crypto bonuses', 'no KYC exchange', 'trading platform comparison'],
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: 'website',
    siteName: 'Trading365',
    title: 'Trading365 - Trade Smarter. Earn Bigger.',
    description: 'Expert crypto exchange reviews, comparisons, and exclusive bonus deals. Find the best trading platforms with unbiased analysis and real user insights.',
    url: BASE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Trading365 - Trade Smarter. Earn Bigger.' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@trading365x',
    title: 'Trading365 - Trade Smarter. Earn Bigger.',
    description: 'Expert crypto exchange reviews, comparisons, and exclusive bonus deals. Find the best trading platforms with unbiased analysis and real user insights.',
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
        <link rel="alternate" type="application/rss+xml" title="Trading365 RSS Feed" href="/feed.xml" />
        <link rel="alternate" type="text/plain" title="Trading365 LLM Index" href="/llms.txt" />
        <link rel="alternate" type="text/plain" title="Trading365 LLM Full Dataset" href="/llms-full.txt" />
      </head>
      <GoogleAnalytics />
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <PartnerPixels />
        <PageTracker />
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
