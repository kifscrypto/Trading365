"use client"

import { useState, useEffect } from "react"
import { X, ExternalLink } from "lucide-react"

interface StickyMobileCTAProps {
  ctaLink: string
  ctaText?: string
}

export function StickyMobileCTA({ ctaLink, ctaText = "Claim Fee Discounts" }: StickyMobileCTAProps) {
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
      <div className="flex items-center gap-3 border-t border-[#eab308]/40 bg-[#1a1a1a] px-4 py-3">
        <p className="flex-1 text-sm text-zinc-300">
          Trading $100k+?{" "}
          <a
            href={ctaLink}
            target="_blank"
            rel="nofollow noopener noreferrer sponsored"
            className="font-semibold text-[#eab308] underline underline-offset-2"
          >
            {ctaText}
          </a>
        </p>
        <a
          href={ctaLink}
          target="_blank"
          rel="nofollow noopener noreferrer sponsored"
          className="shrink-0 rounded-lg bg-[#eab308] px-4 py-2 text-xs font-bold text-black"
        >
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
