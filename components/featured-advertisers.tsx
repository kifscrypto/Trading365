import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Advertiser {
  name: string
  tagline: string
  href: string
}

const advertisers: Advertiser[] = [
  { name: "Novava", tagline: "$10,000 trading comp", href: "https://www.novava.com/en_US/partner/front/KIFS" },
  { name: "Ourbit", tagline: "Up to $750 bonus", href: "https://www.ourbit.com/activity/kol?id=3e867811b31e4eddb2280e34fb1e05cb" },
  { name: "Bitunix", tagline: "No-KYC futures", href: "https://www.bitunix.com/register?vipCode=VP7Q" },
  { name: "Your Ad Here", tagline: "Advertise with us", href: "/about#contact" },
]

export function FeaturedAdvertisers() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
          <Badge
            variant="outline"
            className="shrink-0 border-primary/30 text-primary self-start"
          >
            Featured Partners
          </Badge>
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
            {advertisers.map((ad) => {
              const isExternal = ad.href.startsWith("http")
              return (
                <a
                  key={ad.name}
                  href={ad.href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer sponsored" : undefined}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3 transition-all hover:border-primary/30 hover:bg-card"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                    {ad.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {ad.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{ad.tagline}</p>
                  </div>
                  {isExternal && (
                    <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
