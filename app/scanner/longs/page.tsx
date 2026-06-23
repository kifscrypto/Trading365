import type { Metadata } from "next"
import Link from "next/link"
import { neon } from "@neondatabase/serverless"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Radar, ShieldCheck, Bell, ArrowRight, Zap, Check, TrendingDown } from "lucide-react"
import { premiumEnabled } from "@/lib/premium"
import { ScannerNewsletter } from "@/components/scanner-newsletter"
import { computePnl } from "@/lib/scanner-pnl"
import { ScannerPnlCard } from "@/components/scanner-pnl-card"

const BASE_URL = "https://trading365.org"

const META_DESCRIPTION =
  "Automated altcoin long scanner with real-time Telegram alerts. Covers 100+ perpetual futures across major exchanges. Only fires during confirmed bullish conditions. Live performance tracking."

const WALLET_ADDRESS = "0x2338748664bfdb1fce28a9ad63ce79d65b54eb2d"
const TELEGRAM_SUB_HANDLE = "@Trading365Sub"

export const metadata: Metadata = {
  title: "Altcoin Long Scanner | Real-Time Crypto Long Signals — Trading365",
  description: META_DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/scanner/longs` },
  openGraph: {
    type: "website",
    title: "Altcoin Long Scanner | Real-Time Crypto Long Signals — Trading365",
    description: META_DESCRIPTION,
    url: `${BASE_URL}/scanner/longs`,
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "Altcoin Long Scanner | Real-Time Crypto Long Signals — Trading365",
    description: META_DESCRIPTION,
  },
}

const schemaData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trading365 Altcoin Long Scanner",
  url: `${BASE_URL}/scanner/longs`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web, Telegram",
  description:
    "Automated crypto altcoin long signal scanner. Scans 100+ liquid altcoin perpetual futures across major exchanges every 15 minutes using a multi-factor bullish scoring model. Signals delivered to Telegram with entry price, three take-profit levels and stop loss.",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    priceCurrency: "USD",
    seller: { "@type": "Organization", name: "Trading365", url: BASE_URL },
  },
  provider: { "@type": "Organization", name: "Trading365", url: BASE_URL },
}

export const revalidate = 300

interface Stats {
  tp1WinRate: number | null
  directionalAccuracy: number | null
  totalSignals: number
  signalsConfirmed: number
  avgMove: number | null
  calibrating: boolean
}

// Below this many filtered signals with 24h outcomes, the rate is statistically
// meaningless — show "Calibrating" instead of broadcasting a noisy percentage.
const MIN_SAMPLE = 50

// Stats are the LONG product: direction='long', hostile (bullish BTC) regime,
// score ≥ 8 (the entry-alert threshold). TP1 = +1.5% within 24h; directional
// accuracy = price rose (>0).
async function getStats(): Promise<Stats> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const aggRows = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE s.market_condition = 'hostile' AND s.score >= 8 AND o24.pct_change IS NOT NULL
        )::int AS filtered_with_24h,
        COUNT(*) FILTER (
          WHERE s.market_condition = 'hostile' AND s.score >= 8 AND o24.pct_change >= 1.5
        )::int AS tp1_hits,
        COUNT(*) FILTER (
          WHERE s.market_condition = 'hostile' AND s.score >= 8 AND o24.pct_change > 0
        )::int AS up_hits,
        AVG(o24.pct_change) FILTER (
          WHERE s.market_condition = 'hostile' AND s.score >= 8 AND o24.pct_change IS NOT NULL
        )::float AS avg_move,
        (SELECT COUNT(*)::int FROM scanner_signals WHERE direction = 'long' AND scanned_at > '2026-06-18') AS total_all
      FROM scanner_signals s
      LEFT JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
      WHERE s.direction = 'long' AND s.scanned_at > '2026-06-18'
    `

    const agg = aggRows[0] ?? {}
    const denom = (agg.filtered_with_24h ?? 0) as number
    const ready = denom >= MIN_SAMPLE
    return {
      tp1WinRate:          ready ? ((agg.tp1_hits as number) / denom) * 100 : null,
      directionalAccuracy: ready ? ((agg.up_hits as number) / denom) * 100 : null,
      totalSignals:        (agg.total_all ?? 0) as number,
      signalsConfirmed:    ready ? ((agg.tp1_hits ?? 0) as number) : 0,
      avgMove:             ready ? (agg.avg_move as number) : null,
      calibrating:         !ready,
    }
  } catch {
    return { tp1WinRate: null, directionalAccuracy: null, totalSignals: 0, signalsConfirmed: 0, avgMove: null, calibrating: true }
  }
}

interface RecentWin {
  symbol: string
  exchange: string
  pctChange: number
  scannedAt: string
}

// Recent long wins — drawn from the SAME product as the headline stats
// (direction='long', hostile regime, score >= 7) so the feed can never contradict
// the advertised win rate. A win = TP1+ (price rose >= 1.5% within 24h).
async function getRecentWins(): Promise<RecentWin[]> {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const rows = await sql`
      SELECT s.symbol, s.exchange,
             o24.pct_change::float AS pct_change,
             s.scanned_at
      FROM scanner_signals s
      JOIN scanner_outcomes o24 ON o24.signal_id = s.id AND o24.hours_after = 24
      WHERE s.direction = 'long'
        AND s.market_condition = 'hostile'
        AND s.score >= 8
        AND o24.pct_change >= 1.5
        AND s.scanned_at > NOW() - INTERVAL '30 days'
        AND s.scanned_at > '2026-06-18'
      ORDER BY s.scanned_at DESC
      LIMIT 12
    `
    return (rows as Array<{ symbol: string; exchange: string; pct_change: number; scanned_at: string }>).map(r => ({
      symbol:    r.symbol,
      exchange:  r.exchange,
      pctChange: r.pct_change,
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
  weex: "WEEX",
  bitunix: "Bitunix",
}

const features = [
  {
    icon: Radar,
    title: "Multi-Exchange Scanner",
    description:
      "Scans 100+ liquid altcoins every 15 minutes across major exchanges. Multi-factor bullish scoring model covering structure, momentum, volume, RSI, MACD and funding rate.",
  },
  {
    icon: ShieldCheck,
    title: "BTC Sentiment Filter",
    description:
      "Long signals only fire during confirmed bullish market conditions. The scanner goes completely silent during bear markets and uncertain conditions — because going long against the trend is how you lose money.",
  },
  {
    icon: Bell,
    title: "Real-Time Telegram Alerts",
    description:
      "Entry signals fired instantly with price, three take-profit levels and stop loss. No dashboard to check — the alert comes to you.",
  },
]

const monthlyFeatures = [
  "Real-time Telegram alerts",
  "All three TP levels + stop loss",
  "Full signal history with outcomes",
  "Performance dashboard access",
]

const quarterlyFeatures = ["Same features as monthly", "Priority support"]

export default async function LongScannerPage() {
  const [stats, recentWins, pnl] = await Promise.all([getStats(), getRecentWins(), computePnl()])
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
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-4xl px-4 py-24 lg:px-6 text-center relative">
          <Badge variant="outline" className="mb-6 border-emerald-500/40 text-emerald-400 gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            Live Scanning
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl text-balance">
            Altcoin Long Scanner.{" "}
            <span className="text-emerald-400">Ride the Momentum.</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg leading-relaxed text-muted-foreground text-balance">
            Automated crypto long scanner covering 100+ perpetual futures across OKX, Hyperliquid, Bybit, MEXC, BingX, Bitunix, BloFin, CoinEx, XT.com and WEEX. Long signals with entry price, three take-profit levels and stop loss, straight to Telegram.
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

      {/* Stats bar */}
      <section id="performance" className="border-b border-border bg-zinc-900">
        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-border text-center">
            <div className="px-4 py-2">
              {tp1WinRate === null
                ? <p className="text-sm font-semibold text-muted-foreground pt-3 leading-tight">Calibrating — data accumulating</p>
                : <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmtPct(tp1WinRate)}</p>}
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">TP1 Win Rate</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">TP1 hit rate (1.5% move)</p>
            </div>
            <div className="px-4 py-2">
              {directionalAccuracy === null
                ? <p className="text-sm font-semibold text-muted-foreground pt-3 leading-tight">Calibrating — data accumulating</p>
                : <p className="text-3xl font-bold text-foreground tabular-nums">{fmtPct(directionalAccuracy)}</p>}
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Directional Accuracy</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">price rose within 24h</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">{totalSignals.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Total Signals Tracked</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">and counting</p>
            </div>
            <div className="px-4 py-2">
              {signalsConfirmed > 0
                ? <p className="text-3xl font-bold text-emerald-400 tabular-nums">{signalsConfirmed.toLocaleString()}</p>
                : <p className="text-sm font-semibold text-muted-foreground pt-3 leading-tight">Calibrating — data accumulating</p>}
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Signals Confirmed</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">hit TP1 within 24h</p>
            </div>
            <div className="px-4 py-2">
              {avgMove === null
                ? <p className="text-sm font-semibold text-muted-foreground pt-3 leading-tight">Calibrating — data accumulating</p>
                : <p className={`text-3xl font-bold tabular-nums ${avgMove > 0 ? "text-emerald-400" : "text-foreground"}`}>
                    {`${avgMove > 0 ? "+" : ""}${avgMove.toFixed(2)}%`}
                  </p>}
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Avg Move</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">avg 24h move</p>
            </div>
          </div>
        </div>
      </section>

      {/* Simulated running P&L */}
      <ScannerPnlCard book={pnl.long} accent="emerald" heading="Simulated P&L — Longs" />

      {/* Recent wins */}
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
              Confirmed longs · last 30 days
            </span>
          </div>
          {recentWins.length > 0 ? (
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
                    <span className="font-bold tabular-nums text-emerald-400">+{w.pctChange.toFixed(1)}%</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                      24h ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-zinc-900 px-6 py-10 text-center">
              <p className="text-foreground font-medium">Long scanner launching soon.</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Short scanner signals available now.{" "}
                <Link href="/scanner" className="text-emerald-400 hover:underline">View the Short Scanner →</Link>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-5xl px-4 py-20 lg:px-6">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-3 text-emerald-400 border-emerald-500/30">
            How It Works
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Built for Serious Longs</h2>
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <f.icon className="h-5 w-5 text-emerald-400" />
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

      {/* Cross-link to short scanner */}
      <section className="mx-auto max-w-5xl px-4 pb-4 lg:px-6">
        <Link
          href="/scanner"
          className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-zinc-900 px-6 py-5 hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <TrendingDown className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Bear market?</span> Our Short Scanner has a 54% TP1 hit rate across 3,000+ tracked signals.
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">Short Scanner →</span>
        </Link>
      </section>

      {/* Newsletter capture */}
      <ScannerNewsletter accent="emerald" utmCampaign="long-scanner" />

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-20 lg:px-6">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3 text-emerald-400 border-emerald-500/30">
              Pricing
            </Badge>
            <h2 className="text-2xl font-bold text-foreground">Simple, Crypto-Native Pricing</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
              One subscription covers <span className="text-foreground font-medium">both the Short and Long scanners</span>. Pay in USDT or ETH. Cancel any time — no auto-renewal.
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
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
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
            <div className="relative flex flex-col rounded-xl border border-emerald-500/40 bg-zinc-900 p-6">
              <Badge className="absolute -top-2.5 right-4 bg-emerald-500 text-zinc-950 hover:bg-emerald-500">
                Save 21%
              </Badge>
              <p className="text-xs uppercase tracking-widest text-emerald-400">Quarterly</p>
              <p className="mt-3 text-4xl font-bold text-foreground tabular-nums">
                $69 <span className="text-base font-medium text-muted-foreground">USDT / 3 months</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {quarterlyFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">1</span>
                  <p className="text-muted-foreground">Hit a <span className="text-foreground font-medium">Subscribe</span> button above and pay in USDT, ETH or any supported coin at checkout.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">2</span>
                  <p className="text-muted-foreground">Once the payment confirms, you get a private one-time link to the premium signals channel.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">3</span>
                  <p className="text-muted-foreground">Tap the link, you&apos;re approved automatically, and access runs for your full term — short and long signals both.</p>
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">1</span>
                  <div>
                    <p className="text-foreground">Send USDT or ETH (ERC-20) to wallet address:</p>
                    <code className="mt-1.5 block break-all rounded-md border border-border bg-zinc-950 px-3 py-2 font-mono text-xs text-emerald-400">
                      {WALLET_ADDRESS}
                    </code>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">2</span>
                  <p className="text-muted-foreground">
                    Message <span className="text-foreground font-medium">{TELEGRAM_SUB_HANDLE}</span> on Telegram with your tx hash.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">3</span>
                  <p className="text-muted-foreground">
                    Get added to the private signals group within 24 hours — covering both short and long signals.
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <Zap className="h-6 w-6 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Ready to Ride the Trend?</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Get real-time long signals delivered directly to your Telegram. No noise, no lag.
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
