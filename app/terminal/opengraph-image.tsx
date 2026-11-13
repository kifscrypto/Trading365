import { ImageResponse } from 'next/og'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { DeskCard } from '@/lib/og/desk-card'
import { FallbackCard } from '@/lib/og/signal-card'

// Social card for /terminal. Rendered from code so the copy and the price can never
// drift from the product page, and so it can be previewed offline before deploy.
//
// NEVER THROWS: a failed render breaks the preview for the page, so a missing
// asset or an unsupported style falls back to the branded neutral card.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'T365 Terminal — the crypto terminal you own. Scanner, charts, news and alerts in one Windows app.'

export default function Image() {
  try {
    return new ImageResponse(<DeskCard logo={brandMark()} />, { ...size, fonts: ogFonts() })
  } catch (error) {
    console.error('[og] desk card render failed, using the plain fallback:', error)
    return new ImageResponse(<FallbackCard url="trading365.org/terminal" />, size)
  }
}
