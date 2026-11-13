import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Bell, ChartCandlestick, Check, Download, HardDrive, Newspaper, Radar, WifiOff, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeskCheckoutButton } from '@/components/desk-checkout-button'
import { deskEnabled, DESK_PRODUCT } from '@/lib/desk'
import { getPublishedCount } from '@/lib/signals/public'
import { jsonLd } from '@/lib/utils/json-ld'

// The proof strip reads the public archive count; refresh it every 10 minutes.
export const revalidate = 600

const BASE_URL = 'https://trading365.org'
const TERMINAL_URL = `${BASE_URL}/terminal`
const TERMINAL_TITLE = 'T365 Terminal — The Crypto Terminal You Own'
const TERMINAL_DESCRIPTION = 'Scanner, charts, news, alerts and market context in one Windows app. Pay $299 once. No subscription, no account. Try it free for 7 days.'

export const metadata: Metadata = {
  title: TERMINAL_TITLE,
  description: TERMINAL_DESCRIPTION,
  alternates: { canonical: TERMINAL_URL },
  openGraph: {
    type: 'website',
    siteName: 'Trading365',
    title: TERMINAL_TITLE,
    description: TERMINAL_DESCRIPTION,
    url: TERMINAL_URL,
  },
  twitter: {
    card: 'summary_large_image',
    site: '@trading365x',
    title: TERMINAL_TITLE,
    description: TERMINAL_DESCRIPTION,
  },
}

const features = [
  { icon: Radar, title: 'Find the setups', text: 'The T365 scanner scores longs and shorts, gates them on the BTC regime, and shows entry, stop and five targets.' },
  { icon: ChartCandlestick, title: 'See the chart', text: 'Real candles with funding, open interest, BTC dominance and Fear & Greed right beside them.' },
  { icon: Newspaper, title: 'Stay informed', text: 'CoinDesk and Cointelegraph headlines tagged to the assets you watch, one click from the original article.' },
  { icon: Bell, title: 'Never miss a move', text: 'Native Windows alerts on your watchlist and signals, plus your own .ics calendar.' },
  { icon: HardDrive, title: 'Keep your data', text: 'Watchlists, signals and settings live in one local file, with one-click JSON backup.' },
  { icon: WifiOff, title: 'Own it outright', text: 'Offline-signed licence. No account, no activation server, no recurring check.' },
]

const rentVsOwn: [string, string][] = [
  ['A bill every month', 'One payment, once'],
  ['Price can rise at any time', 'Your price is locked in'],
  ['Needs an account to log in', 'No account required'],
  ['Your data lives on their servers', 'Your data stays on your PC'],
  ['Stop paying and it stops working', 'Nothing to renew. It keeps running'],
]

const faqs = [
  ['Does T365 Terminal work offline?', 'The app and your cached data open without our website or an activation server. Fresh prices, scans, and news still need the relevant public data providers and an internet connection. The app must be running to scan.'],
  ['What does perpetual licence mean?', 'Your one-time purchase includes every future major version of T365 Terminal. The 365-day period covers support only; it does not remove access to the app or any future version.'],
  ['How is this different from the free web scanner?', 'The web scanner is hosted by us and free users see signals on a delay. T365 Terminal runs on your own PC and puts the scanner, charts, news, alerts and your watchlist in one app, for a single payment. One honest trade-off: it only scans while the app is running.'],
  ['What is included?', 'The Windows app, scanner, charts, watchlists, market overview, news, calendar imports, native alerts, offline activation, and JSON backup export. Exchange execution, wallets, portfolio tracking, AI features, and stocks are not included.'],
  ['Is it available for Mac or Linux?', 'Not yet. T365 Terminal is Windows x64 only today.'],
  ['Does it replace my web scanner subscription?', 'No. T365 Terminal is a separate one-time purchase. Existing T365 web subscriptions remain separate.'],
  ['How do I recover my licence?', 'Sign in to your Trading365 account. Your paid T365 Terminal orders include the installer, licence key, and update entitlement. A licence email is also sent to your account address.'],
]

const terminalSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${TERMINAL_URL}#software`,
      name: 'T365 Terminal',
      url: TERMINAL_URL,
      description: TERMINAL_DESCRIPTION,
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
        url: TERMINAL_URL,
      },
      provider: {
        '@type': 'Organization',
        name: 'Trading365',
        url: BASE_URL,
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${TERMINAL_URL}#faq`,
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
}

export default async function TerminalPage() {
  const enabled = deskEnabled()
  const published = await getPublishedCount()
  return (
    <div className="t-theme">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(terminalSchema) }} />

      {/* Hero */}
      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-[.9fr_1.1fr] lg:px-6">
          <div>
            <Badge variant="outline" className="mb-5 border-primary/40 font-mono tracking-wider text-primary">T365 TERMINAL · WINDOWS · PAY ONCE</Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Stop renting your trading tools. <span className="text-primary">Own the terminal.</span></h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">Scanner, live charts, news, alerts and market context in one Windows app. One payment. Nothing to renew. No account to lose.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {enabled ? <DeskCheckoutButton /> : <Button size="lg" disabled>Checkout opens soon</Button>}
              <Button size="lg" variant="outline" asChild><a href={DESK_PRODUCT.downloadPath}><Download className="mr-2 h-4 w-4" />Download free trial</a></Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground"><strong className="text-foreground">${DESK_PRODUCT.amount} once</strong> · every future major version · {DESK_PRODUCT.updateDays} days of support · 7-day full-feature trial</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-2xl shadow-primary/5">
            <Image src="/images/t365-desk-overview.png" alt="T365 Terminal showing the market overview, real BTC chart, watchlist, and related news" width={1440} height={960} sizes="(min-width: 1280px) 660px, (min-width: 1024px) 55vw, 100vw" priority className="h-auto w-full" />
          </div>
        </div>
      </section>

      {/* Proof */}
      <section className="border-b border-border bg-zinc-900/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <p className="text-muted-foreground">
            {published > 0
              ? <><strong className="text-foreground">{published.toLocaleString('en-US')} signals published</strong> in our public record, wins and losses, unedited. The same scanner runs inside T365 Terminal.</>
              : <>Built on the scanner behind our public, unedited signal record.</>}
          </p>
          <Link href="/signals" className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">See every signal, wins and losses <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {/* Rent vs own */}
      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-12 lg:px-6">
          <h2 className="text-center text-2xl font-bold md:text-3xl">Rent your tools, or own your terminal.</h2>
          <div className="mt-8 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-2 bg-zinc-900 text-sm font-semibold">
              <div className="px-5 py-3 text-muted-foreground">Subscription tools</div>
              <div className="px-5 py-3 text-primary">T365 Terminal</div>
            </div>
            {rentVsOwn.map(([rent, own]) => (
              <div key={rent} className="grid grid-cols-2 border-t border-border text-sm">
                <div className="flex items-start gap-2 px-5 py-3 text-muted-foreground"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />{rent}</div>
                <div className="flex items-start gap-2 bg-primary/5 px-5 py-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{own}</div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">A $25/month tool costs $300 in a year. T365 Terminal is <strong className="text-foreground">${DESK_PRODUCT.amount}, once</strong>.</p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border bg-zinc-900/50">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">Every tool you need, in one place.</h2>
            <p className="mt-2 text-muted-foreground">No tab juggling. The scanner, the chart, the news and the context sit together, so every decision is made with the full picture.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(feature => <article key={feature.title} className="rounded-xl border border-border bg-card p-5"><feature.icon className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold">{feature.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p></article>)}
          </div>
        </div>
      </section>

      {/* Ownership + before you download */}
      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-2 lg:px-6">
          <div>
            <h2 className="text-2xl font-bold">Ownership without the usual catch</h2>
            <ul className="mt-6 space-y-4">
              {['Your scanner and data stay on your computer', 'Offline-signed licence activation', 'Every future major version is included in your perpetual licence', 'Cached content remains available when providers are unavailable'].map(item => <li key={item} className="flex gap-3 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}
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
              <div className="flex justify-between gap-5"><dt className="text-muted-foreground">First run</dt><dd className="text-right">Windows may show a one-time &ldquo;unrecognised app&rdquo; prompt. Choose More info, then Run anyway.</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* FAQ + final CTA */}
      <section className="bg-zinc-900/50">
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-6">
          <h2 className="text-center text-2xl font-bold">Questions before you buy</h2>
          <div className="mt-8 space-y-4">{faqs.map(([question, answer]) => <details key={question} className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p></details>)}</div>
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold">Stop renting. Start owning.</h2>
            <div className="mt-5">{enabled ? <DeskCheckoutButton /> : <Button size="lg" disabled>Checkout opens soon</Button>}</div>
            <p className="mt-4 text-xs text-muted-foreground">Technical analysis for research and education, not financial advice. No return is promised or implied.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
