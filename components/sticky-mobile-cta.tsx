"use client"

import { useState, useEffect } from "react"
import { X, ExternalLink } from "lucide-react"

interface StickyMobileCTAProps {
  ctaLink: string
}

export function StickyMobileCTA({ ctaLink }: StickyMobileCTAProps) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function onScroll() {
      const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      if (pct >= 30) setVisible(true)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible || dismissed) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="flex items-center gap-3 border-t border-[#eab308]/30 backdrop-blur-md bg-black/75 px-4 py-3">
        <p className="flex-1 text-sm text-zinc-300 leading-snug">
          Trading $100k+?
        </p>
        <a
          href={ctaLink}
          target="_blank"
          rel="nofollow noopener noreferrer sponsored"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#eab308] px-4 py-2.5 text-sm font-bold text-black whitespace-nowrap"
        >
          Claim VIP Discounts
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
