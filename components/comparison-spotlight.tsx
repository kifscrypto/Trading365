import { CheckCircle2, XCircle, ArrowRight, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ExchangeRow {
  name: string
  rating: number
  fees: string
  kyc: boolean
  leverage: string
  bonus: string
  referralLink: string
  copyTrading: boolean
  rank: number
}

const exchanges: ExchangeRow[] = [
  { name: "WEEX", rating: 8.8, fees: "0.02% / 0.06%", kyc: false, leverage: "400x", bonus: "$500 USDT", referralLink: "https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity", copyTrading: true, rank: 1 },
  { name: "BYDFi", rating: 8.5, fees: "0.01% / 0.06%", kyc: false, leverage: "200x", bonus: "$1,500 USDT", referralLink: "https://partner.bydfi.com/register?vipCode=KifsCrypto", copyTrading: true, rank: 2 },
  { name: "Bitunix", rating: 8.3, fees: "0.02% / 0.06%", kyc: false, leverage: "125x", bonus: "$400", referralLink: "https://www.bitunix.com/register?vipCode=VP7Q", copyTrading: true, rank: 3 },
  { name: "BloFin", rating: 8.2, fees: "0.02% / 0.06%", kyc: false, leverage: "150x", bonus: "$5,000 USDT", referralLink: "https://partner.blofin.com/d/KIFSCrypto", copyTrading: false, rank: 4 },
  { name: "Toobit", rating: 8.0, fees: "0.02% / 0.1%", kyc: false, leverage: "100x", bonus: "$5,000 USDT", referralLink: "https://www.toobit.com/t/JOM3yF", copyTrading: true, rank: 5 },
  { name: "CoinEx", rating: 8.1, fees: "0.02% / 0.06%", kyc: false, leverage: "100x", bonus: "Varies", referralLink: "https://www.coinex.com/register?rc=ycq7e&channel=Referral", copyTrading: false, rank: 6 },
  { name: "BingX", rating: 8.4, fees: "0.02% / 0.05%", kyc: true, leverage: "150x", bonus: "$5,000 USDT", referralLink: "https://bingx.com/en/rewards?ref=MSK9FA", copyTrading: true, rank: 7 },
]

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
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold text-foreground">
                      {ex.name.charAt(0)}
                    </div>
                    <span className="font-medium text-foreground">{ex.name}</span>
                  </div>
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
                  <a href={ex.referralLink} target="_blank" rel="noopener noreferrer sponsored">
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
