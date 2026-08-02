import Link from "next/link"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ResolvedTopPick } from "@/lib/data/top-picks"

/**
 * Above-the-fold answer to "which exchange should I use?".
 *
 * Sits directly under the hero copy so a visitor gets three ranked options and a
 * clickable CTA without scrolling — the homepage was the top entry AND top exit
 * page, with 31% average scroll depth, so anything below the fold was reaching
 * roughly a third of visitors.
 *
 * Server component on purpose: the cards (and therefore the affiliate anchors)
 * must be in the SSR HTML, both for crawlers and because the outbound-click
 * tracker only sees real <a href> elements.
 */
export function TopPicks({ picks }: { picks: ResolvedTopPick[] }) {
  if (!picks.length) return null

  return (
    <div className="mt-10 w-full">
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => (
          <div
            key={p.slug}
            className="flex flex-col rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
          >
            <span className="mb-3 inline-flex w-fit items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.68rem] font-bold tracking-widest text-primary">
              {p.label}
            </span>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold text-foreground">{p.name}</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                {p.rating.toFixed(1)}
                <span className="text-xs font-normal text-muted-foreground">/10</span>
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.oneLiner}</p>
            <p className="mt-2 text-sm font-semibold text-primary">{p.bonusLine}</p>

            <div className="mt-4 flex flex-col gap-2 pt-1">
              {/* Direct to the merchant — no /go redirector, so affiliate
                  attribution and the referrer survive the click. */}
              {p.affiliateUrl && (
                <Button className="w-full font-semibold" asChild>
                  <a
                    href={p.affiliateUrl}
                    target="_blank"
                    rel="sponsored nofollow noopener noreferrer"
                  >
                    Visit {p.name}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full border-primary/30 font-semibold text-foreground hover:bg-primary/10"
                asChild
              >
                <Link href={p.reviewHref}>Read Review</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Partner picks · we may earn a commission when you sign up.
      </p>
    </div>
  )
}
