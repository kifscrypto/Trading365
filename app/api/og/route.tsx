import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

const GOLD = '#d4a017'
const BG = '#09090b'
const ZINC_900 = '#18181b'
const ZINC_800 = '#27272a'
const ZINC_500 = '#71717a'
const ZINC_400 = '#a1a1aa'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') ?? 'Trade Smarter. Earn Bigger.'
  const category = searchParams.get('category') ?? ''
  const rating = searchParams.get('rating') ?? ''
  // Featured image, full-bleed behind the card. Only trusted absolute https URLs
  // are honoured (blob uploads / own origin); anything else falls back to the
  // text-only card so a bad param can never break image generation.
  const rawImage = searchParams.get('image') ?? ''
  let image = rawImage.startsWith('https://') ? rawImage : ''
  // Preflight: a broken/missing image would throw *inside* ImageResponse and break
  // the whole card (un-catchable), so verify it resolves to a real image first.
  if (image) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const head = await fetch(image, { method: 'GET', signal: ctrl.signal })
      clearTimeout(t)
      if (!head.ok || !(head.headers.get('content-type') ?? '').startsWith('image/')) image = ''
    } catch {
      image = ''
    }
  }

  const fontSize = title.length > 80 ? 36 : title.length > 55 ? 44 : 52

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          backgroundColor: BG,
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 64px',
        }}
      >
        {/* Featured image (full-bleed cover) */}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            width={1200}
            height={630}
            style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }}
          />
        ) : null}

        {/* Legibility scrim: darker top (logo) + darker bottom (title), photo shows through the middle */}
        {image ? (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            backgroundImage: 'linear-gradient(180deg, rgba(9,9,11,0.72) 0%, rgba(9,9,11,0.18) 28%, rgba(9,9,11,0.45) 60%, rgba(9,9,11,0.97) 100%)',
          }} />
        ) : null}

        {/* Top gold accent bar */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 5,
          backgroundColor: GOLD,
          display: 'flex',
        }} />

        {/* Subtle corner glow (only on the plain card) */}
        {!image ? (
          <div style={{
            position: 'absolute',
            top: -80, right: -80,
            width: 400, height: 400,
            borderRadius: '50%',
            backgroundColor: 'rgba(212,160,23,0.06)',
            display: 'flex',
          }} />
        ) : null}

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', textShadow: image ? '0 2px 8px rgba(0,0,0,0.7)' : 'none' }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: '#ffffff' }}>TRADING</span>
          <span style={{ fontSize: 26, fontWeight: 700, color: GOLD }}>365</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: 'flex' }} />

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {category ? (
            <div style={{
              display: 'flex',
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(212,160,23,0.12)',
              borderRadius: 6,
              padding: '5px 14px',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'rgba(212,160,23,0.3)',
            }}>
              <span style={{ color: GOLD, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {category}
              </span>
            </div>
          ) : null}

          {/* Title + rating only on the text card. Featured images are generated
              with the title already baked in, so overlaying it would read twice. */}
          {!image ? (
            <div style={{
              fontSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.15,
              maxWidth: 1000,
            }}>
              {title}
            </div>
          ) : null}

          {!image && rating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: GOLD, fontSize: 22, fontWeight: 700 }}>{rating}/10</span>
              <span style={{ color: ZINC_500, fontSize: 16 }}>Trading365 Rating</span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 36,
          paddingTop: 20,
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: ZINC_800,
        }}>
          <span style={{ color: ZINC_500, fontSize: 15 }}>Expert Crypto Exchange Reviews & Comparisons</span>
          <span style={{ color: ZINC_400, fontSize: 15, fontWeight: 600 }}>trading365.org</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
