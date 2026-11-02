import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Bell, ChartCandlestick, Check, Download, HardDrive, Newspaper, Radar, ShieldCheck, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeskCheckoutButton } from '@/components/desk-checkout-button'
import { deskEnabled, DESK_PRODUCT } from '@/lib/desk'
import { jsonLd } from '@/lib/utils/json-ld'

const BASE_URL = 'https://trading365.org'
const DESK_URL = `${BASE_URL}/desk`
const DESK_TITLE = 'T365 Desk — The Crypto Workstation You Buy Once'
const DESK_DESCRIPTION = 'T365 Desk for Windows combines a crypto scanner, charts, news and alerts. Start your 7-day free trial, then pay $299 once for a perpetual licence.'
const DESK_OG_IMAGE = `${BASE_URL}/api/og?title=${encodeURIComponent('T365 Desk — Crypto Tools You Buy Once')}&category=${encodeURIComponent('Windows Software')}`

export const metadata: Metadata = {
  title: DESK_TITLE,
  description: DESK_DESCRIPTION,
  alternates: { canonical: DESK_URL },
  openGraph: {
    type: 'website',
    siteName: 'Trading365',
    title: DESK_TITLE,
    description: DESK_DESCRIPTION,
    url: DESK_URL,
    images: [{ url: DESK_OG_IMAGE, width: 1200, height: 630, alt: 'T365 Desk — local-first Windows crypto workstation' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@trading365x',
    title: DESK_TITLE,
    description: DESK_DESCRIPTION,
    images: [DESK_OG_IMAGE],
  },
}

const features = [
  { icon: Radar, title: 'The T365 scanner, locally', text: 'Long and short candidate scoring, BTC regime gates, 1H entry triggers, stops, and five targets—running on your computer.' },
  { icon: ChartCandlestick, title: 'Charts and market context', text: 'Actual candles, funding, open interest, BTC dominance, and Fear & Greed from public providers.' },
  { icon: Newspaper, title: 'News without the noise', text: 'CoinDesk and Cointelegraph headlines with source labels, asset tags, topic filters, and original-article links.' },
  { icon: Bell, title: 'Alerts and your own calendar', text: 'Native signal notifications, watchlists, and standard .ics calendar imports saved on your machine.' },
  { icon: HardDrive, title: 'Local data and backup', text: 'Watchlists, alerts, signals, cached content, and settings stay in a local file you can back up.' },
  { icon: WifiOff, title: 'Built to be yours', text: 'Offline-signed activation. No T365 account, hosted database, activation server, or recurring licence check.' },
]

const faqs = [
  ['Does T365 Desk work offline?', 'The app and your cached data open without our website or an activation server. Fresh prices, scans, and news still need the relevant public data providers and an internet connection. The app must be running to scan.'],
  ['What does perpetual licence mean?', 'Your one-time purchase includes every future major version of T365 Desk. The 365-day period covers support only; it does not remove access to the app or any future version.'],
  ['What is included at launch?', 'The Windows app, scanner, charts, watchlists, market overview, news, calendar imports, native alerts, offline activation, and JSON backup export. Exchange execution, wallets, portfolio tracking, AI features, and stocks are not included.'],
  ['How do I recover my licence?', 'Sign in to your Trading365 account. Your paid T365 Desk orders include the installer, licence key, and update entitlement. A licence email is also sent when email delivery is configured.'],
]

const deskSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${DESK_URL}#software`,
      name: 'T365 Desk',
      url: DESK_URL,
      description: DESK_DESCRIPTION,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Windows x64',
      downloadUrl: `${BASE_URL}${DESK_PRODUCT.downloadPath}`,
      featureList: [
        'Crypto market scanner',
        'Market charts and context',
        'Crypto news reader',
        'Native alerts and watchlists',
        'Local data and JSON backup',
        'Offline-signed licence activation',
      ],
      offers: {
        '@type': 'Offer',
        price: String(DESK_PRODUCT.amount),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: DESK_URL,
      },
      provider: {
        '@type': 'Organization',
        name: 'Trading365',
        url: BASE_URL,
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${DESK_URL}#faq`,
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
}

export default function DeskPage() {
  const enabled = deskEnabled()
  return (
    <div className="t-theme">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(deskSchema) }} />
      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-[.9fr_1.1fr] lg:px-6">
          <div>
            <Badge variant="outline" className="mb-5 border-primary/40 text-primary">Local-first Windows software</Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Professional crypto tools. <span className="text-primary">One payment. No subscription.</span></h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">T365 Desk combines our scanner, real market charts, relevant news, and native alerts in one local app. No subscription. No activation server. Your desk, on your computer.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {enabled ? <DeskCheckoutButton /> : <Button size="lg" disabled>Checkout being configured</Button>}
              <Button size="lg" variant="outline" asChild><a href={DESK_PRODUCT.downloadPath}><Download className="mr-2 h-4 w-4" />Download trial</a></Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground"><strong className="text-foreground">${DESK_PRODUCT.amount} once</strong> · perpetual licence + all future versions · {DESK_PRODUCT.updateDays} days of support · 7-day full-feature trial</p>
            {!enabled && <p className="mt-3 text-xs text-amber-400">Checkout is unavailable until payment and licence signing are configured. The trial download also requires installer hosting.</p>}
          </div>
          <div className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-2xl shadow-primary/5">
            <Image src="/images/t365-desk-overview.png" alt="T365 Desk showing the market overview, real BTC chart, watchlist, and related news" width={1440} height={960} sizes="(min-width: 1280px) 660px, (min-width: 1024px) 55vw, 100vw" priority className="h-auto w-full" />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-zinc-900/50">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
          <div className="max-w-2xl"><h2 className="text-2xl font-bold">Everything supports the setup in front of you</h2><p className="mt-2 text-muted-foreground">Not a collection of disconnected widgets. Select an asset and see its chart, model reasoning, market context, and related news together.</p></div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(feature => <article key={feature.title} className="rounded-xl border border-border bg-card p-5"><feature.icon className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold">{feature.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-2 lg:px-6">
          <div>
            <h2 className="text-2xl font-bold">Ownership without the usual catch</h2>
            <ul className="mt-6 space-y-4">
              {['Your scanner and data stay on your computer', 'Offline-signed licence activation', 'Every future major version is included in your perpetual licence', 'Cached content remains available when providers are unavailable', 'Existing T365 web subscriptions remain separate'].map(item => <li key={item} className="flex gap-3 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}
            </ul>
            <Button asChild variant="outline" className="mt-7"><Link href="/signals">Inspect the verified scanner record <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">Before you download</h3>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Platform</dt><dd>Windows x64</dd></div>
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Trial</dt><dd>7 days, full features</dd></div>
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Licence</dt><dd>Perpetual licence · all future versions</dd></div>
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Support included</dt><dd>{DESK_PRODUCT.updateDays} days included</dd></div>
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Live-data requirement</dt><dd>Internet + app running</dd></div>
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">Installer signing</dt><dd className="text-right">Code signing is a separate distribution step</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="bg-zinc-900/50">
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-6">
          <h2 className="text-center text-2xl font-bold">Questions before you buy</h2>
          <div className="mt-8 space-y-4">{faqs.map(([question, answer]) => <details key={question} className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}</div>
          <div className="mt-10 text-center">
            {enabled ? <DeskCheckoutButton /> : <Button size="lg" disabled>Checkout being configured</Button>}
            <p className="mt-4 text-xs text-muted-foreground">Technical analysis for research and education, not financial advice. No return is promised or implied.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
