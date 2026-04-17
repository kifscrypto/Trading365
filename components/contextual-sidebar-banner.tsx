"use client"

import { useState, useEffect, useRef } from "react"
import { ExternalLink } from "lucide-react"

interface SectionLink {
  headingId: string
  exchangeName: string
  ctaLink: string
  label: string
}

interface ContextualSidebarBannerProps {
  defaultCtaLink: string
  defaultCtaText: string
  sectionLinks: SectionLink[]
}

export function ContextualSidebarBanner({ defaultCtaLink, defaultCtaText, sectionLinks }: ContextualSidebarBannerProps) {
  const [activeSection, setActiveSection] = useState<SectionLink | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!sectionLinks.length) return

    const ids = sectionLinks.map(s => s.headingId)

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const match = sectionLinks.find(s => s.headingId === entry.target.id)
            if (match) setActiveSection(match)
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    )

    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [sectionLinks])

  const link = activeSection?.ctaLink ?? defaultCtaLink
  const label = activeSection
    ? `Exclusive ${activeSection.exchangeName} ${activeSection.label}`
    : defaultCtaText

  return (
    <div className="rounded-xl border border-[#eab308] bg-[#1a1a1a] p-5 transition-all duration-300">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#eab308] mb-2">
        {activeSection ? `${activeSection.exchangeName} Offer` : "Exclusive Offer"}
      </p>
      <p className="text-sm font-bold text-white leading-snug mb-4">{label}</p>
      <a
        href={link}
        target="_blank"
        rel="nofollow noopener noreferrer sponsored"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#eab308] px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
      >
        Activate Now
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </div>
  )
}
