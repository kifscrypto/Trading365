import { ImageResponse } from 'next/og'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { FallbackCard } from '@/lib/og/signal-card'

// Social card for /scanner/longs.
//
// Needed because that page sets its own `openGraph` object, and a page-level
// openGraph REPLACES the layout's rather than merging with it — which silently
// dropped the inherited og:image and left the tag empty. The file convention
// restores it, and from code rather than a checked-in JPEG for the same reason
// as the other cards.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 altcoin long scanner — live signals with every result published'

export default function Image() {
  return new ImageResponse(
    <FallbackCard url="trading365.org/scanner/longs" logo={brandMark()} />,
    { ...size, fonts: ogFonts() },
  )
}
