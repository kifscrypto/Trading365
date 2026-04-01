import { CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BonusCardProps {
  name: string
  bonus: string
  features: string[]
  tag?: string
  referralLink: string
}

export function BonusCard({ name, bonus, features, tag, referralLink }: BonusCardProps) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_30px_-5px] hover:shadow-primary/10">
      {tag && (
        <div className="absolute top-0 right-0 rounded-bl-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {tag}
        </div>
      )}
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-foreground">
            {name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{name}</h3>
            <p className="text-sm text-muted-foreground">Exchange</p>
          </div>
        </div>
        <div className="rounded-lg bg-primary/10 px-4 py-3">
          <p className="text-xs font-medium text-primary/80">Sign-up Bonus</p>
          <p className="text-xl font-bold text-primary">{bonus}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto border-t border-border p-4">
        <a href={referralLink} target="_blank" rel="noopener noreferrer sponsored">
          <Button className="w-full gap-2 font-semibold" size="sm">
            Claim Now
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>
    </div>
  )
}
