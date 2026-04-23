'use client'

import { useEffect, useState } from 'react'

interface Promotion {
  id: number
  name: string
  image_url: string
  destination_url: string
}

export function PromoBanner() {
  const [promo, setPromo] = useState<Promotion | null>(null)

  useEffect(() => {
    fetch('/api/promotions')
      .then(r => r.json())
      .then((data: Promotion[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setPromo(data[Math.floor(Math.random() * data.length)])
        }
      })
      .catch(() => {})
  }, [])

  if (!promo) return null

  return (
    <div className="mx-auto max-w-7xl px-4 pb-2 lg:px-6">
      <a
        href={promo.destination_url}
        target="_blank"
        rel="nofollow noopener noreferrer sponsored"
        className="relative block overflow-hidden rounded-xl border border-border"
        aria-label={promo.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={promo.image_url}
          alt={promo.name}
          className="w-full h-auto object-cover"
        />
        <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/60 leading-none">
          Sponsored
        </span>
      </a>
    </div>
  )
}
