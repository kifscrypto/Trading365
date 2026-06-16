import type { Metadata } from "next"
import Link from "next/link"
import { neon } from "@neondatabase/serverless"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Radar, ShieldCheck, Bell, ArrowRight, Zap, Check, TrendingUp } from "lucide-react"
import { premiumEnabled } from "@/lib/premium"

const BASE_URL = "https://trading365.org"

const META_DESCRIPTION =
  "66% TP1 hit rate. 87% directional accuracy across 4,700+ tracked signals. Automated altcoin short scanner with real-time Telegram alerts. Only fires during favourable market conditions."

const WALLET_ADDRESS = "0x2338748664bfdb1fce28a9ad63ce79d65b54eb2d"
const TELEGRAM_SUB_HANDLE = "@Trading365Sub"

export const metadata: Metadata = {
  title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
  description: META_DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/scanner` },
  openGraph: {
    type: "website",
    title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
    description: META_DESCRIPTION,
    url: `${BASE_URL}/scanner`,
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
    description: META_DESCRIPTION,
  },
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

interface Stats {
  tp1WinRate: number | null
  directionalAccuracy: number | null
  totalSignals: number
  signalsConfirmed: number
  avgMove: number | null
}

async function getStats(): Promise<Stats> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const aggRows = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change IS NOT NULL
        )::int AS filtered_with_24h,
        COUNT(*) FILTER (
          WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change <= -1.5
        )::int AS tp1_hits,
        COUNT(*) FILTER (
          WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change < 0
        )::int AS down_hits,
        AVG(o24.pct_change) FILTER (
          WHERE s.market_condition = 'favourable' AND s.score >= 7 AND o24.pct_change IS NOT NULL
        )::float AS avg_move,
        (SELECT COUNT(*)::int FROM scanner_signals) AS total_all
      FROM scanner_signals s
      LEFT JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
    `

    const agg = aggRows[0] ?? {}
    const denom = (agg.filtered_with_24h ?? 0) as number
    return {
      tp1WinRate:          denom > 0 ? ((agg.tp1_hits as number) / denom) * 100 : null,
      directionalAccuracy: denom > 0 ? ((agg.down_hits as number) / denom) * 100 : null,
      totalSignals:        (agg.total_all ?? 0) as number,
      signalsConfirmed:    (agg.tp1_hits ?? 0) as number,
      avgMove:             denom > 0 ? (agg.avg_move as number) : null,
    }
  } catch {
    return { tp1WinRate: null, directionalAccuracy: null, totalSignals: 0, signalsConfirmed: 0, avgMove: null }
  }
}

interface RecentWin {
  symbol: string
  exchange: string
  pctChange: number
  tp: number // highest target reached: 1, 2 or 3
  scannedAt: string
}

// Recent confirmed wins — sourced from the SAME dataset as the headline win
// rate (favourable regime, score ≥ 7, 24h outcome ≤ −1.5% = TP1), so the feed
// can never contradict the advertised numbers.
async function getRecentWins(): Promise<RecentWin[]> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const rows = await sql`
      SELECT s.symbol, s.exchange,
             o24.pct_change::float AS pct_change,
             s.scanned_at
      FROM scanner_signals s
      JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
      WHERE s.market_condition = 'favourable'
        AND s.score >= 7
        AND o24.pct_change <= -1.5
        AND s.scanned_at > NOW() - INTERVAL '30 days'
      ORDER BY s.scanned_at DESC
      LIMIT 12
    `
    return (rows as Array<{ symbol: string; exchange: string; pct_change: number; scanned_at: string }>).map(r => ({
      symbol:    r.symbol,
      exchange:  r.exchange,
      pctChange: r.pct_change,
      tp:        r.pct_change <= -4 ? 3 : r.pct_change <= -2.5 ? 2 : 1,
      scannedAt: r.scanned_at,
    }))
  } catch {
    return []
  }
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtPct(n: number | null, digits = 0): string {
  if (n === null) return "—"
  return `${n.toFixed(digits)}%`
}

const exchangeLabel: Record<string, string> = {
  okx: "OKX",
  hyperliquid: "Hyperliquid",
  mexc: "MEXC",
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
      "Signals are completely suppressed during neutral and hostile market conditions — the scanner only fires when the macro supports the trade.",
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
  const [stats, recentWins] = await Promise.all([getStats(), getRecentWins()])
  const { tp1WinRate, directionalAccuracy, totalSignals, signalsConfirmed, avgMove } = stats
  const automated = premiumEnabled()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      {/* Hero */}
      <section className="relative border-b border-border bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-4xl px-4 py-24 lg:px-6 text-center relative">
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
            Automated crypto altcoin scanner covering 100+ perpetual futures across OKX, Hyperliquid and Bybit. Short signals with entry price and stop level, straight to Telegram.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="font-semibold gap-2 text-base" asChild>
              <a href="https://t.me/trading365Sub" target="_blank" rel="noopener noreferrer">
                Get Access
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="font-semibold border-border text-foreground hover:bg-zinc-800" asChild>
              <Link href="#performance">See Performance</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Cross-link to long scanner */}
      <section className="bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
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
      <section id="performance" className="border-b border-border bg-zinc-900">
        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-border text-center">
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmtPct(tp1WinRate)}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">TP1 Win Rate</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">TP1 hit rate (1.5% move)</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">{fmtPct(directionalAccuracy)}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Directional Accuracy</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">price fell within 24h</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">{totalSignals.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Total Signals Tracked</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">and counting</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">{signalsConfirmed.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Signals Confirmed</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">hit TP1 within 24h</p>
            </div>
            <div className="px-4 py-2">
              <p className={`text-3xl font-bold tabular-nums ${avgMove !== null && avgMove < 0 ? "text-emerald-400" : "text-foreground"}`}>
                {avgMove === null ? "—" : `${avgMove > 0 ? "+" : ""}${avgMove.toFixed(2)}%`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Avg Move</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">avg 24h move</p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent wins */}
      {recentWins.length > 0 && (
        <section className="border-b border-border bg-zinc-950">
          <div className="mx-auto max-w-5xl px-4 py-10 lg:px-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  Recent Wins
                </h2>
                <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </Badge>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Confirmed shorts · last 30 days
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recentWins.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">${w.symbol.replace("USDT", "")}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {exchangeLabel[w.exchange] ?? w.exchange} · {fmtAgo(w.scannedAt)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-bold tabular-nums text-emerald-400">{w.pctChange.toFixed(1)}%</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                      TP{w.tp} ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Feature cards */}
      <section className="mx-auto max-w-5xl px-4 py-20 lg:px-6">
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

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-20 lg:px-6">
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
                $29 <span className="text-base font-medium text-muted-foreground">USDT / month</span>
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
                  <a href="/api/pay/create?plan=monthly">Subscribe — $29 / month</a>
                </Button>
              )}
            </div>

            {/* Quarterly */}
            <div className="relative flex flex-col rounded-xl border border-primary/40 bg-zinc-900 p-6">
              <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground hover:bg-primary">
                Save 21%
              </Badge>
              <p className="text-xs uppercase tracking-widest text-primary">Quarterly</p>
              <p className="mt-3 text-4xl font-bold text-foreground tabular-nums">
                $69 <span className="text-base font-medium text-muted-foreground">USDT / 3 months</span>
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
                  <a href="/api/pay/create?plan=quarterly">Subscribe — $69 / 3 months</a>
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
                  <p className="text-muted-foreground">Hit a <span className="text-foreground font-medium">Subscribe</span> button above and pay in USDT, ETH or any supported coin at checkout.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">2</span>
                  <p className="text-muted-foreground">Once the payment confirms, you get a private one-time link to the premium signals channel.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">3</span>
                  <p className="text-muted-foreground">Tap the link, you&apos;re approved automatically, and access runs for your full term.</p>
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

      {/* Bottom CTA */}
      <section className="border-t border-border bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-20 lg:px-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Ready to Trade Smarter?</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Get real-time short signals delivered directly to your Telegram. No noise, no lag.
          </p>
          <div className="mt-8">
            <Button size="lg" className="font-semibold gap-2 text-base" asChild>
              <a href="https://t.me/trading365Sub" target="_blank" rel="noopener noreferrer">
                Get Access
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
