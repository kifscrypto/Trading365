import { ShieldAlert, ExternalLink } from "lucide-react"

const ALTERNATIVES = [
  { name: "Bybit", link: "https://partner.bybit.com/b/2705" },
  { name: "WEEX",  link: "https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity" },
]

interface RegionalAlternativeCardProps {
  blockedExchange?: string
}

export function RegionalAlternativeCard({ blockedExchange }: RegionalAlternativeCardProps) {
  const exchange = blockedExchange ?? "this exchange"
  return (
    <div className="my-6 rounded-lg border border-[#22c55e] bg-[#111] overflow-hidden">
      <div className="flex items-start gap-3 p-5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[#22c55e] mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-white mb-1">
            Blocked on {exchange}?
          </p>
          <p className="text-sm text-zinc-300 mb-4">
            Trading365 users are pre-approved for Bybit and WEEX — with local regional workarounds and high-limit withdrawals. No extra steps required.
          </p>
          <div className="flex flex-wrap gap-3">
            {ALTERNATIVES.map(alt => (
              <a
                key={alt.name}
                href={alt.link}
                target="_blank"
                rel="nofollow noopener noreferrer sponsored"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#22c55e] px-4 py-2 text-sm font-semibold text-[#22c55e] hover:bg-[#22c55e]/10 transition-colors"
              >
                Access {alt.name}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
