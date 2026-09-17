import { ImageResponse } from 'next/og'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { FallbackCard } from '@/lib/og/signal-card'

// Social card for /signals — the archive hub.
//
// The archive is the page people link to when they want to show the whole
// record rather than one trade, so it gets the brand card with the pitch on it
// instead of the neutral one. Layout and fonts are shared with the receipt
// cards; see lib/og/signal-card.tsx.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 verified signal receipts'

export default function Image() {
  return new ImageResponse(
    <FallbackCard url="trading365.org/signals" logo={brandMark()} />,
    { ...size, fonts: ogFonts() },
  )
}