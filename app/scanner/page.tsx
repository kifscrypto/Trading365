import type { Metadata } from "next"
import { jsonLd } from "@/lib/utils/json-ld"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Radar, ShieldCheck, Bell, ArrowRight, Zap, Check, TrendingUp } from "lucide-react"
import { PLANS, premiumEnabled } from "@/lib/premium"
import { ScannerNewsletter } from "@/components/scanner-newsletter"
import { computePnl } from "@/lib/scanner-pnl"
import { getScannerStats } from "@/lib/scanner-stats"
import { ScannerPnlCard } from "@/components/scanner-pnl-card"
import { getArchiveStats, getArchivePage } from "@/lib/signals/public"
import { SignalFeed } from "@/components/signal-feed"

const BASE_URL = "https://trading365.org"

// The advertised hit rate and tracked-setup count are DERIVED in
// generateMetadata below — never typed in. A hardcoded claim silently becomes a
// false one as soon as the record moves (this read "65%" while the
// fired-signal record was 60.4%), and /scanner now sits one click away from the
// public archive that publishes the real number.

const WALLET_ADDRESS = "0x2338748664bfdb1fce28a9ad63ce79d65b54eb2d"
const TELEGRAM_SUB_HANDLE = "@Trading365Sub"

export async function generateMetadata(): Promise<Metadata> {
  const TITLE = "Altcoin Short Scanner — Real-Time Crypto Signals | Trading365"
  // Flooring to the nearest 5% keeps the claim strictly TRUE (never an
  // overstatement) while staying stable enough that the SERP snippet does not
  // churn on every revalidation. The exact figure lives in the page body.
  // The description no longer carries a hit rate or a setup count. It quoted the
  // TP1-within-24h proxy ("60%+ ... 33,000+ tracked setups") while the sitewide
  // metadata says "62,000+ signals tracked" and the archive publishes 2,269
  // receipts - three different numbers describing the same subject, which is
  // precisely the split identity this pass exists to remove. A durable claim
  // beats a drifting one, and the real figures are one click away on the page.
  const description =
    "Altcoin short scanner firing on 100+ perpetual futures. Every signal and its verified result is published at fire time - wins, losses, nothing deleted."
  return {
    title: { absolute: TITLE },
    description,
    alternates: { canonical: `${BASE_URL}/scanner` },
    openGraph: {
      type: "website",
      title: TITLE,
      description,
      url: `${BASE_URL}/scanner`,
      siteName: "Trading365",
    },
    twitter: { card: "summary_large_image", title: TITLE, description },
  }
}

const schemaData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trading365 Altcoin Short Scanner",
  url: `${BASE_URL}/scanner`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web, Telegram",
  description:
    "Automated crypto altcoin short signal scanner. Scans 100+ liquid altcoin perpetual futures across OKX, Hyperliquid and Bybit every 15 minutes using an 8-factor scoring model. Signals delivered to Telegram with entry price, stop level, and full signal breakdown.",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    priceCurrency: "USD",
    seller: {
      "@type": "Organization",
      name: "Trading365",
      url: BASE_URL,
    },
  },
  provider: {
    "@type": "Organization",
    name: "Trading365",
    url: BASE_URL,
  },
}

export const revalidate = 300

function fmtPct(n: number | null, digits = 0): string {
  if (n === null) return "—"
  return `${n.toFixed(digits)}%`
}

const features = [
  {
    icon: Radar,
    title: "Multi-Exchange Scanner",
    description:
      "Scans 100+ liquid altcoins every 15 minutes across major exchanges. 8-signal scoring model covering structure, volume, RSI, MACD, and funding rate.",
  },
  {
    icon: ShieldCheck,
    title: "BTC Sentiment Filter",
    description:
      "Signals are completely suppressed during neutral and uptrend market conditions — the scanner only fires when the macro supports the trade.",
  },
  {
    icon: Bell,
    title: "Telegram Alerts",
    description:
      "Entry signals fired instantly with price, stop level and full signal breakdown. No dashboard to check — the alert comes to you.",
  },
]

const monthlyFeatures = [
  "Real-time Telegram alerts",
  "All three TP levels + stop loss",
  "Full signal history with outcomes",
  "Performance dashboard access",
]

const quarterlyFeatures = ["Same features as monthly", "Priority support"]

export default async function ScannerPage() {
  // Two datasets, deliberately kept apart:
  //   stats        - the TP1-within-24h proxy on the scored candidate pool
  //                  (scanner internals, quarantined in the UI)
  //   archiveStats - the verified record, from the SAME rollUpArchive source the
  //                  homepage and /signals render. The headline numbers use it.
  const [stats, archiveStats, archivePage, pnl] = await Promise.all([
    getScannerStats("short"),
    getArchiveStats(30),
    getArchivePage({ page: 1 }),
    computePnl(),
  ])
  // The uncurated feed: the same rows the archive publishes, newest first, wins
  // and losses together. Ten of them.
  const feedRows = archivePage.rows.slice(0, 10)
  const { tp1WinRate, directionalAccuracy, totalSignals, signalsConfirmed, avgMove } = stats
  const automated = premiumEnabled()
  // Prices and the savings badge are derived from PLANS — the same object
  // /api/pay/create charges from. Typed into the markup they would silently
  // become a lie the moment a price changed, advertising a number the checkout
  // no longer honours.
  const monthlyUsd = PLANS.monthly.amount
  const quarterlyUsd = PLANS.quarterly.amount
  const quarterlyMonths = Math.round(PLANS.quarterly.days / PLANS.monthly.days)
  const savingsPct = Math.round((1 - quarterlyUsd / (monthlyUsd * quarterlyMonths)) * 100)

  return (
    <div className="t-theme">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schemaData) }}
      />
      {/* Hero */}
      <section className="relative border-b border-border bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6 text-center relative">
          <Badge variant="outline" className="mb-6 border-primary/40 text-primary gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Live Scanning
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl text-balance">
            Altcoin Short Scanner.{" "}
            <span className="text-primary">Signals in Real Time.</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg leading-relaxed text-muted-foreground text-balance">
            Automated crypto altcoin scanner covering 100+ perpetual futures across OKX, Hyperliquid and Bybit. Short signals with entry price and stop level — and every result published on the site, wins and losses alike.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="font-semibold gap-2 text-base" asChild>
              <Link href="/signup?next=/account">
                Get Access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="font-semibold border-border text-foreground hover:bg-zinc-800" asChild>
              <Link href="#performance">See Performance</Link>
            </Button>
          </div>

          {/* Telegram is a SECONDARY link now. As the primary button it sent the most
              engaged visitor on the whole site off-site before they had seen a single
              result — nothing to attribute, no account to follow up with, and no way
              to show them the record they were about to subscribe to. */}
          <p className="mt-4 text-sm text-muted-foreground">
            Free account, no card needed. Prefer Telegram?{' '}
            <a href="https://t.me/trading365Sub" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Follow the free channel
            </a>
            .
          </p>
        </div>
      </section>

      {/* Cross-link to long scanner */}
      <section className="bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6">
          <Link
            href="/scanner/longs"
            className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-5 hover:border-emerald-500/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">New — the Long Scanner is live.</span> When BTC turns bullish, catch the upside: the same engine, inverted for long setups. One subscription covers both.
              </p>
            </div>
            <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap">Open Long Scanner →</span>
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      {/* -- The verified record ------------------------------------------------
          These three are the HEADLINE numbers and they come from getArchiveStats
          - the same rollUpArchive source the homepage and /signals render, so
          all three agree by construction. They used to come from the
          TP1-within-24h proxy quarantined below, which measures a different
          thing on a different population (the scored candidate pool, not fired
          signals) and so disagreed with the archive on every visit. */}
      <section id="performance" className="border-b border-border bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                {archiveStats.hitRate != null ? `${archiveStats.hitRate.toFixed(1)}%` : "-"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Hit rate - last 30 days</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                {archiveStats.wins} of {archiveStats.resolved} resolved
              </p>
            </div>
            <div className="rounded-xl border border-border bg-zinc-950 p-5">
              <p className={`text-3xl font-bold tabular-nums ${
                archiveStats.netExpectancy == null
                  ? ""
                  : archiveStats.netExpectancy >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}>
                {archiveStats.netExpectancy != null
                  ? `${archiveStats.netExpectancy > 0 ? "+" : ""}${archiveStats.netExpectancy.toFixed(1)}%`
                  : "-"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Net expectancy / signal</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                after {archiveStats.netRoundTripPct.toFixed(2)}% round trip
              </p>
            </div>
            <div className="rounded-xl border border-border bg-zinc-950 p-5">
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {archivePage.total.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Receipts published</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">0 deleted</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Same aggregates as the{" "}
            <Link href="/signals" className="underline hover:text-foreground">public archive</Link> - every
            resolved signal is published, wins and losses alike.
          </p>

          {/* -- Secondary metric, explicitly quarantined --------------------- */}
          <div className="mt-8 rounded-xl border border-border bg-zinc-950/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scanner internals - measured differently from the verified record
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              TP1 within 24 hours, over the scored candidate pool rather than fired signals. Not comparable
              to the hit rate above, and not part of the published track record.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{fmtPct(tp1WinRate)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">TP1 win rate</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{fmtPct(directionalAccuracy)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Directional accuracy</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{totalSignals.toLocaleString()}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Setups tracked</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-foreground">{signalsConfirmed.toLocaleString()}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">TP1 within 24h</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground/60">
              Average 24h move across that pool:{" "}
              {avgMove === null ? "-" : `${avgMove > 0 ? "+" : ""}${avgMove.toFixed(2)}%`}
            </p>
          </div>
        </div>
      </section>

      {/* -- Latest results: the uncurated feed -------------------------------- */}
      <section className="border-b border-border bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold text-foreground">
              Latest results - published as they close
            </h2>
            <Link href="/signals" className="text-xs text-muted-foreground hover:text-foreground">
              Full archive
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The last ten resolved signals, newest first, wins and losses together. This replaced a
            wins-only list: showing only the targets that hit, on a site whose entire claim is that
            nothing is deleted, was the clearest contradiction of that claim anywhere on the site.
          </p>
          <div className="mt-4">
            <SignalFeed rows={feedRows} />
          </div>
        </div>
      </section>

      {/* Simulated running P&L */}
      <ScannerPnlCard book={pnl.short} accent="red" heading="Simulated P&L — Shorts" />

      {/* Pricing — directly after the proof (stats + P&L), not buried at the
          bottom: a visitor who has just seen the record should be able to act
          on it without scrolling past features, newsletter and the outro. */}
      <section id="pricing" className="border-t border-border bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3 text-primary border-primary/30">
              Pricing
            </Badge>
            <h2 className="text-2xl font-bold text-foreground">Simple, Crypto-Native Pricing</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              Pay in USDT or ETH. Cancel any time — no auto-renewal.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
            {/* Monthly */}
            <div className="flex flex-col rounded-xl border border-border bg-zinc-900 p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Monthly</p>
              <p className="mt-3 text-4xl font-bold text-foreground tabular-nums">
                ${monthlyUsd} <span className="text-base font-medium text-muted-foreground">USDT / month</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {monthlyFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {automated && (
                <Button asChild className="mt-auto w-full font-semibold">
                  <Link href="/signup?next=/account">Subscribe — ${monthlyUsd} / month</Link>
                </Button>
              )}
            </div>

            {/* Quarterly */}
            <div className="relative flex flex-col rounded-xl border border-primary/40 bg-zinc-900 p-6">
              <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground hover:bg-primary">
                Save {savingsPct}%
              </Badge>
              <p className="text-xs uppercase tracking-widest text-primary">Quarterly</p>
              <p className="mt-3 text-4xl font-bold text-foreground tabular-nums">
                ${quarterlyUsd} <span className="text-base font-medium text-muted-foreground">USDT / {quarterlyMonths} months</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {quarterlyFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {automated && (
                <Button asChild className="mt-auto w-full font-semibold">
                  <Link href="/signup?next=/account">Subscribe — ${quarterlyUsd} / {quarterlyMonths} months</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Payment instructions */}
          {automated ? (
            <div className="mt-12 max-w-3xl mx-auto rounded-xl border border-border bg-zinc-900 p-6">
              <h3 className="text-lg font-semibold text-foreground">How it works</h3>
              <ol className="mt-5 space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">1</span>
                  <p className="text-muted-foreground">Create a free account, or sign in — your membership is attached to it, not to a chat handle.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">2</span>
                  <p className="text-muted-foreground">Hit <span className="text-foreground font-medium">Subscribe</span> and pay in USDT, ETH or any supported coin at checkout.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">3</span>
                  <p className="text-muted-foreground">Access unlocks on your account the moment the payment confirms, for your full term. Telegram is optional — join the channel from your account page.</p>
                </li>
              </ol>
              <p className="mt-6 text-xs text-muted-foreground/80">
                Instant access on confirmation. Refund available within 48h if not satisfied.
              </p>
            </div>
          ) : (
            <div className="mt-12 max-w-3xl mx-auto rounded-xl border border-border bg-zinc-900 p-6">
              <h3 className="text-lg font-semibold text-foreground">How to subscribe</h3>
              <ol className="mt-5 space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">1</span>
                  <div>
                    <p className="text-foreground">Send USDT or ETH (ERC-20) to wallet address:</p>
                    <code className="mt-1.5 block break-all rounded-md border border-border bg-zinc-950 px-3 py-2 font-mono text-xs text-emerald-400">
                      {WALLET_ADDRESS}
                    </code>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">2</span>
                  <p className="text-muted-foreground">
                    Message <span className="text-foreground font-medium">{TELEGRAM_SUB_HANDLE}</span> on Telegram with your tx hash.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">3</span>
                  <p className="text-muted-foreground">
                    Get added to the private signals group within 24 hours.
                  </p>
                </li>
              </ol>
              <p className="mt-6 text-xs text-muted-foreground/80">
                Payments verified manually. Refund available within 48h if not satisfied.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            How It Works
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Built for Serious Shorts</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
            Every signal is the output of a multi-factor scoring model — not a single indicator.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-4 rounded-xl border border-border bg-zinc-900 p-6"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Newsletter capture */}
      <ScannerNewsletter accent="red" utmCampaign="short-scanner" />

    </div>
  )
}
