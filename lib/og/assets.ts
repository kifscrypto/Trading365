import fs from 'node:fs'
import path from 'node:path'

/**
 * Font and brand assets for the OG cards — read from disk once per warm lambda.
 *
 * WHY FONTS ARE SHIPPED AT ALL
 * Satori (behind next/og) takes font BYTES. When none are registered it falls
 * back to the single regular face bundled with @vercel/og, and every
 * `fontWeight: 700` on a card is then silently ignored — which is what made the
 * old cards look flat. Two faces fix it: regular for labels, bold for anything
 * that has to shout.
 *
 * WHY assets/ AND NOT public/
 * Nothing here is served to browsers; it only has to exist inside the function.
 * outputFileTracingIncludes in next.config.mjs copies assets/** into the routes
 * that render a card, because a file that is neither imported nor public is not
 * traced automatically.
 */
const ASSETS = path.join(process.cwd(), 'assets')

export type Face = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }

/** The family name the cards declare. Must match FONT in
 *  lib/og/signal-card.tsx, which is where the styles reference it. */
export const OG_FONT_FAMILY = 'Noto Sans'

let fontCache: Face[] | null = null
// undefined = not attempted yet, null = attempted and unavailable.
let markCache: string | null | undefined

export function ogFonts(): Face[] {
  if (fontCache) return fontCache
  const faces: { file: string; weight: 400 | 700 }[] = [
    { file: 'NotoSans-Regular.ttf', weight: 400 },
    { file: 'NotoSans-Bold.ttf', weight: 700 },
  ]
  fontCache = faces.flatMap((f) => {
    try {
      return [{
        name: OG_FONT_FAMILY,
        data: fs.readFileSync(path.join(ASSETS, 'fonts', f.file)),
        weight: f.weight,
        style: 'normal' as const,
      }]
    } catch (err) {
      // Degrade, never throw: a card without its bold face still renders.
      console.error(`[og] font ${f.file} unavailable:`, err)
      return []
    }
  })
  return fontCache
}

/** The brand mark as a data URI — Satori takes a data URI or an absolute URL. */
export function brandMark(): string | undefined {
  if (markCache !== undefined) return markCache ?? undefined
  try {
    markCache = `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, 'og', 'logo-mark.png')).toString('base64')}`
  } catch (err) {
    console.error('[og] brand mark unavailable:', err)
    markCache = null
  }
  return markCache ?? undefined
}
