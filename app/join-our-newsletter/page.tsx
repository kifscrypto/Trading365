import type { Metadata } from "next"
import { NewsletterCta } from "@/components/newsletter-cta"

export const metadata: Metadata = {
  title: "Join Our Newsletter",
  description:
    "Get exclusive exchange deals, in-depth reviews, and market insights delivered to your inbox weekly. Join 5,000+ crypto traders.",
}

export default function NewsletterPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <NewsletterCta />
    </div>
  )
}
