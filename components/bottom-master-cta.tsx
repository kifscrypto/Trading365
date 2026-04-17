import Link from "next/link"
import { ExternalLink, ShieldCheck } from "lucide-react"

export function BottomMasterCTA() {
  return (
    <div
      className="rounded-lg border-2 border-[#eab308] overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #161616 100%)" }}
    >
      <div className="p-8 md:p-10 flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            💰 Stop Donating Profits to Exchanges
          </h2>
          <p className="text-base text-zinc-300 leading-relaxed max-w-2xl">
            You've seen the math. High-volume traders save $2,000+ monthly just by choosing the right partner tiers. We've pre-negotiated exclusive bonuses, maker rebates, and VIP fast-tracks across the top 2026 exchanges.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <Link
            href="/bonuses"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#eab308] px-8 py-4 text-base font-bold text-black transition-opacity hover:opacity-90"
          >
            VIEW ALL PARTNER DEALS & BONUSES
            <ExternalLink className="h-4 w-4 shrink-0" />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-[#22c55e]" />
              Updated for April 2026
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-[#22c55e]" />
              Verified Partner Tiers
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-[#22c55e]" />
              No-KYC Options Available
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
