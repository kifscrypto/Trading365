import { ImageResponse } from 'next/og'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { FallbackCard } from '@/lib/og/signal-card'

// Social card for the homepage.
//
// Rendered from code rather than checked in as a JPEG, for the same reason no
// number appears in the <title>: a checked-in image is a claim frozen at the
// moment somebody exported it. The old
// trading365-crypto-exchange-reviews.jpg is still in public/ and still serves as
// the layout fallback for routes that have no card of their own.
//
// TO PUT A LIVE FIGURE ON THIS CARD (e.g. the hit rate), read it here with
// getArchiveStats and pass it into the card. The route renders per request, so
// the number on the image tracks the archive automatically and there is nothing
// to regenerate when stats move — which is exactly why a number is safe here and
// not in a <title>.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 — live crypto signal scanner with a public, verified track record'

export default function Image() {
  return new ImageResponse(
    <FallbackCard url="trading365.org" logo={brandMark()} />,
    { ...size, fonts: ogFonts() },
  )
}
