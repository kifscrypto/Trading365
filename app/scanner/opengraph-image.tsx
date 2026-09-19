import { ImageResponse } from 'next/og'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { FallbackCard } from '@/lib/og/signal-card'

// Social card for /scanner. Same reasoning as app/opengraph-image.tsx: rendered
// from code, so nothing here can go stale.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 altcoin scanner — live signals with every result published'

export default function Image() {
  return new ImageResponse(
    <FallbackCard url="trading365.org/scanner" logo={brandMark()} />,
    { ...size, fonts: ogFonts() },
  )
}
