import { ExternalLink, Check, TrendingUp } from "lucide-react"

interface ConversionCardProps {
  title: string
  savingsMetric: string
  perks: string[]
  ctaLink: string
  ctaText: string
  exchangeName?: string
  socialProof?: string
}

export function ConversionCard({ title, savingsMetric, perks, ctaLink, ctaText, exchangeName, socialProof }: ConversionCardProps) {
  return (
    <div className="my-8 rounded-lg border border-[#eab308] bg-[#1a1a1a] overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Value Prop — left */}
        <div className="flex-1 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[#eab308] shrink-0" />
            <span className="inline-block rounded-full bg-[#eab308]/15 px-3 py-0.5 text-xs font-semibold text-[#eab308] tracking-wide uppercase">
              {savingsMetric}
            </span>
          </div>
          <p className="text-base font-bold text-white leading-snug mb-3">{title}</p>
          <ul className="flex flex-col gap-1.5">
            {perks.map((perk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#eab308]" />
                {perk}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA — right */}
        <div className="flex flex-col items-center justify-center gap-2 border-t border-[#eab308]/30 md:border-t-0 md:border-l p-5 md:p-6 md:min-w-[200px]">
          {exchangeName && (
            <p className="text-xs text-zinc-400 text-center">Exclusive via Trading365</p>
          )}
          <a
            href={ctaLink}
            target="_blank"
            rel="nofollow noopener noreferrer sponsored"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#eab308] px-5 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 text-center"
          >
            {ctaText}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
          <p style={{ fontSize: 10, opacity: 0.6 }} className="text-zinc-300 text-center leading-snug">
            {socialProof ?? "Trusted by pro traders securing VIP fee tiers via Trading365"}
          </p>
        </div>
      </div>
    </div>
  )
}
