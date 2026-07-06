import { CheckCircle2, XCircle, ArrowRight, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getExchangeBySlug } from "@/lib/data/exchanges"
import { ExchangeLogo } from "@/components/exchange-logo"

// Single source of truth: ratings/fees/links are pulled from the canonical
// exchange data so the homepage grid can never diverge from the review pages
// or the Review structured data. Order = display rank.
const GRID_SLUGS = ["weex", "bydfi", "bitunix", "blofin", "toobit", "coinex", "bingx"]

const exchanges = GRID_SLUGS
  .map((slug, i) => {
    const ex = getExchangeBySlug(slug)
    if (!ex) return null
    return {
      name: ex.name,
      logo: ex.logo,
      rating: ex.rating,
      fees: `${ex.fees.maker} / ${ex.fees.taker}`,
      kyc: ex.kyc,
      leverage: ex.leverage,
      bonus: ex.bonus,
      referralLink: ex.referralLink,
      reviewUrl: ex.fullReview,
      copyTrading: ex.copyTrading,
      rank: i + 1,
    }
  })
  .filter((e): e is NonNullable<typeof e> => e !== null)

export function ComparisonSpotlight() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Comparison
          </Badge>
          <h2 className="text-2xl font-bold text-foreground text-balance">
            Exchange Comparison Table
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Side-by-side analysis of fees, leverage, KYC, and bonuses.
          </p>
        </div>
        <Button variant="ghost" className="gap-2 text-primary hover:text-primary" asChild>
          <Link href="/comparisons">
            Full comparisons
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Exchange</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rating</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fees (M/T)</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">No KYC</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Leverage</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Copy Trade</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Bonus</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Sign Up</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((ex) => (
              <tr
                key={ex.name}
                className="border-b border-border last:border-0 transition-colors hover:bg-secondary/30"
              >
                <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{ex.rank}</td>
                <td className="px-4 py-3.5">
                  <Link href={ex.reviewUrl} className="group/name flex items-center gap-2">
                    <ExchangeLogo name={ex.name} logo={ex.logo} size={28} className="rounded-md" />
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground group-hover/name:text-primary transition-colors">{ex.name}</span>
                      <span className="text-[11px] text-muted-foreground group-hover/name:text-primary/80 transition-colors">Read review</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${(ex.rating / 10) * 60}px` }}
                    />
                    <span className="text-xs font-semibold text-foreground">{ex.rating}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{ex.fees}</td>
                <td className="px-4 py-3.5 text-center">
                  {!ex.kyc ? (
                    <CheckCircle2 className="mx-auto h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="mx-auto h-4 w-4 text-destructive" />
                  )}
                </td>
                <td className="px-4 py-3.5 font-semibold text-foreground text-xs">{ex.leverage}</td>
                <td className="px-4 py-3.5 text-center">
                  {ex.copyTrading ? (
                    <CheckCircle2 className="mx-auto h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="mx-auto h-4 w-4 text-muted-foreground/50" />
                  )}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-primary text-xs">{ex.bonus}</td>
                <td className="px-4 py-3.5 text-center">
                  <a href={ex.referralLink} target="_blank" rel="sponsored nofollow noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
                      Join
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
