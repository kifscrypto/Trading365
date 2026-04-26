import type { Metadata } from "next"
import Link from "next/link"
import { neon } from "@neondatabase/serverless"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Radar, ShieldCheck, Bell, Lock, ArrowRight, TrendingDown, Zap } from "lucide-react"

const BASE_URL = "https://trading365.org"

export const metadata: Metadata = {
  title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
  description:
    "Automated altcoin short signal scanner covering 100+ coins across OKX, Hyperliquid and Bybit. Multi-factor scoring, BTC sentiment filter, and instant Telegram alerts with entry price and stop level.",
  alternates: { canonical: `${BASE_URL}/scanner` },
  openGraph: {
    type: "website",
    title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
    description:
      "Automated altcoin short signal scanner covering 100+ coins across OKX, Hyperliquid and Bybit. Multi-factor scoring with instant Telegram alerts.",
    url: `${BASE_URL}/scanner`,
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "Altcoin Short Scanner — Real-Time Crypto Short Signals | Trading365",
    description:
      "Automated altcoin short signal scanner covering 100+ coins across OKX, Hyperliquid and Bybit. Multi-factor scoring with instant Telegram alerts.",
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

interface PreviewRow {
  symbol: string
  exchange: string
  score: number
  price_at_signal: number
  scanned_at: string
  outcome_24h: number | null
}

async function getStats() {
  const sql = neon(process.env.DATABASE_URL!)
  try {
    const [totRow, weekRow, previewRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS total FROM scanner_signals`,
      sql`SELECT COUNT(*)::int AS week_count FROM scanner_signals WHERE scanned_at > NOW() - INTERVAL '7 days'`,
      sql`
        SELECT
          s.symbol, s.exchange, s.score,
          s.price_at_signal::float AS price_at_signal,
          s.scanned_at,
          o24.pct_change::float AS outcome_24h
        FROM scanner_signals s
        LEFT JOIN scanner_outcomes o24
          ON o24.signal_id = s.id AND o24.hours_after = 24
        ORDER BY s.scanned_at DESC
        LIMIT 5
      `,
    ])
    return {
      total: (totRow[0]?.total ?? 0) as number,
      thisWeek: (weekRow[0]?.week_count ?? 0) as number,
      preview: previewRows as PreviewRow[],
    }
  } catch {
    return { total: 0, thisWeek: 0, preview: [] }
  }
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(6)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
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
      "Market conditions assessed in real time using Fear & Greed, BTC dominance, and funding data. Signals suppressed when conditions are hostile.",
  },
  {
    icon: Bell,
    title: "Telegram Alerts",
    description:
      "Entry signals fired instantly with price, stop level and full signal breakdown. No dashboard to check — the alert comes to you.",
  },
]

export default async function ScannerPage() {
  const { total, thisWeek, preview } = await getStats()

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
              <a href="mailto:contact@trading365.org">
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
      <section className="border-b border-border bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
          <div className="grid grid-cols-3 divide-x divide-border text-center">
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">{total.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Total Signals</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">{thisWeek}</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">This Week</p>
            </div>
            <div className="px-4 py-2">
              <p className="text-3xl font-bold text-foreground tabular-nums">3</p>
              <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">Exchanges</p>
            </div>
          </div>
        </div>
      </section>

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

      <Separator className="mx-auto max-w-5xl bg-border" />

      {/* Performance preview */}
      <section id="performance" className="mx-auto max-w-5xl px-4 py-20 lg:px-6">
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Performance
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Recent Signals</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
            Every signal is logged with entry price and tracked at 24h, 48h and 72h.
          </p>
        </div>

        <div className="relative rounded-xl border border-border overflow-hidden">
          {/* Table header — always visible */}
          <div className="grid grid-cols-5 gap-4 border-b border-border bg-zinc-900 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Symbol</span>
            <span>Exchange</span>
            <span>Score</span>
            <span>Entry Price</span>
            <span>24h Move</span>
          </div>

          {/* Rows — blurred */}
          <div className="select-none" style={{ filter: "blur(5px)", userSelect: "none" }}>
            {preview.length > 0 ? preview.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-5 gap-4 border-b border-border/50 px-5 py-3.5 text-sm last:border-0"
              >
                <span className="font-medium text-foreground">
                  {row.symbol.replace("USDT", "")}
                </span>
                <span className="text-muted-foreground">
                  {exchangeLabel[row.exchange] ?? row.exchange}
                </span>
                <span>
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {row.score}
                  </span>
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  ${fmtPrice(row.price_at_signal)}
                </span>
                <span className={
                  row.outcome_24h === null
                    ? "text-muted-foreground text-xs"
                    : row.outcome_24h < 0
                    ? "text-emerald-400 font-medium"
                    : "text-red-400 font-medium"
                }>
                  {row.outcome_24h === null
                    ? "Pending"
                    : `${row.outcome_24h > 0 ? "+" : ""}${row.outcome_24h.toFixed(2)}%`}
                </span>
              </div>
            )) : (
              /* Placeholder rows when DB is empty */
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 gap-4 border-b border-border/50 px-5 py-3.5 text-sm last:border-0">
                  <span className="font-medium text-foreground">SOLUSDT</span>
                  <span className="text-muted-foreground">OKX</span>
                  <span><span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">7</span></span>
                  <span className="text-muted-foreground font-mono text-xs">$142.3800</span>
                  <span className="text-emerald-400 font-medium">-6.24%</span>
                </div>
              ))
            )}
          </div>

          {/* Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/75 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 border border-border">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Premium members see full performance data</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  24h, 48h and 72h outcomes for every signal — updated automatically.
                </p>
              </div>
              <Button className="font-semibold gap-2" asChild>
                <a href="mailto:contact@trading365.org">
                  Get Access
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
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
              <a href="mailto:contact@trading365.org">
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
