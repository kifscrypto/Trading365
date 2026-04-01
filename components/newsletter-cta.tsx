"use client"

import { Mail } from "lucide-react"
import { useEffect } from "react"

export function NewsletterCta() {
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://subscribe-forms.beehiiv.com/embed.js"
    script.async = true
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  return (
    <section id="newsletter" className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 md:p-12">
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground text-balance">
            Stay Ahead of the Market
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Get exclusive exchange deals, in-depth reviews, and market insights delivered to your inbox weekly. No spam, unsubscribe anytime.
          </p>
          {/* Beehiiv embed -- clipped container hides white iframe borders */}
          <div className="relative mt-6 overflow-hidden rounded-xl" style={{ height: "220px" }}>
            <iframe
              src="https://subscribe-forms.beehiiv.com/6ce90570-571d-47f5-8d56-435c5b554d18"
              data-test-id="beehiiv-embed"
              frameBorder={0}
              scrolling="no"
              className="absolute left-1/2 w-full max-w-lg -translate-x-1/2"
              style={{
                height: "339px",
                top: "-60px",
                background: "transparent",
              }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Join thousands of traders. Free forever.
          </p>
        </div>
      </div>
    </section>
  )
}
