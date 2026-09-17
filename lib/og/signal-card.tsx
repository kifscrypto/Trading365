/**
 * The social card behind /signals/[public_id] — 1200×630, rendered by Satori
 * through next/og.
 *
 * WHY THIS IS A PURE COMPONENT
 * It takes a pre-built model (strings already formatted) and returns pixels. No
 * database, no date formatting, no environment. That keeps the layout testable
 * offline: scripts/og-preview.mjs compiles this one file with tsc and renders
 * every card state through the same @vercel/og build that Next uses in
 * production, so a design change can be inspected as a PNG before it is
 * deployed. The route stays responsible for turning a Receipt into a model.
 *
 * SATORI RULES THAT BITE (all learned the hard way):
 *   - an element may hold ONE text child, so anything mixing text and an
 *     expression must be joined into a single string first;
 *   - every element containing children needs an explicit `display: flex`;
 *   - `img` needs explicit width/height, and only data URIs / absolute URLs work;
 *   - nothing here may throw: a failed render breaks the preview for every page
 *     that embeds it, so the logo is optional and the caller guards it.
 */

export type CardTone = 'win' | 'loss' | 'flat' | 'gold'

export interface SignalCardModel {
  symbol: string
  side: 'short' | 'long'
  exchangeTimeframe: string
  firedText: string
  entryText: string
  stopText: string
  riskText: string
  heldText: string
  reached: number
  total: number
  tone: CardTone
  outcomeLabel: string
  outcomeDetail: string
  moveText: string
  url: string
  /**
   * The trade is still open. Only the ladder changes: "0 of 5 targets reached"
   * is technically true of a running signal but reads as a failure, so an
   * awaiting card says "awaiting first target" instead.
   */
  awaiting?: boolean
}

export interface CardProps {
  model: SignalCardModel
  /** Square PNG data URI for the brand mark. Omit and the card still renders. */
  logo?: string
}

// ── Palette ─────────────────────────────────────────────────────────────────
const GOLD = '#d4a017'
const GOLD_LIGHT = '#f0c04a'
const BG = '#09090b'
const ZINC_400 = '#a1a1aa'
const ZINC_500 = '#71717a'
const ZINC_700 = '#3f3f46'

/**
 * The family the route registers with ImageResponse. Must match OG_FONT_FAMILY
 * in lib/og/assets.ts, which is where the faces are actually loaded. Declared
 * here so a missing font file degrades to the renderer's default instead of
 * picking up a different face per element.
 */
const FONT = 'Noto Sans'

/** Ink used ON the coloured result band. Near-black on every tone: the highest
 *  contrast pairing available, and the only one that survives being scaled down
 *  to a timeline thumbnail. */
const INK: Record<CardTone, string> = {
  win: '#05130a',
  loss: '#2b0510',
  flat: '#111113',
  gold: '#1a1206',
}

const BAND: Record<CardTone, string> = {
  // Gradient rather than a flat fill: a solid block reads as a placeholder, and
  // the light edge gives the band depth once the card is scaled to a thumbnail.
  win: 'linear-gradient(100deg, #4ade80 0%, #22c55e 52%, #0f9d58 100%)',
  loss: 'linear-gradient(100deg, #fda4af 0%, #f43f5e 52%, #be123c 100%)',
  flat: 'linear-gradient(100deg, #cbd5e1 0%, #94a3b8 52%, #64748b 100%)',
  // The brand band, used when there is no outcome to colour-code.
  gold: 'linear-gradient(100deg, #f5d57a 0%, #d4a017 55%, #b07d10 100%)',
}

const SIDE_BADGE = {
  long: { fg: '#86efac', border: '#22c55e', bg: 'rgba(34,197,94,0.14)' },
  short: { fg: '#fca5a5', border: '#f43f5e', bg: 'rgba(244,63,94,0.14)' },
} as const

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Mark + wordmark + promise, as one lockup. */
function Lockup({ logo }: { logo?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={78} height={78} alt="" />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>TRADING</span>
          <span style={{ fontSize: 40, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: '-0.01em' }}>365</span>
        </div>
        <span style={{ fontSize: 15, color: ZINC_500, letterSpacing: '0.22em' }}>VERIFIED SIGNAL RECEIPTS</span>
      </div>
    </div>
  )
}

/**
 * Direction chevron built from a rotated two-sided border box.
 *
 * NOT a ▲/▼ character and NOT a CSS border-triangle: the characters are absent
 * from the fonts we ship (Satori answers a missing glyph by fetching a font from
 * Google at render time, which fails closed) and zero-sized border triangles
 * come out as squares. A rotated chevron is the one form this renderer draws
 * correctly at any size.
 */
function Chevron({ up, color, weight }: { up: boolean; color: string; weight: number }) {
  return (
    <div
      style={{
        display: 'flex', width: weight * 3, height: weight * 3,
        borderTopWidth: weight, borderTopStyle: 'solid', borderTopColor: color,
        borderRightWidth: weight, borderRightStyle: 'solid', borderRightColor: color,
        transform: `rotate(${up ? -45 : 135}deg)`,
      }}
    />
  )
}

/** One label-above-value stat, used in the trade detail row. */
function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'down' | 'up' }) {
  const color = tone === 'down' ? '#fda4af' : tone === 'up' ? '#86efac' : '#ffffff'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 14, color: ZINC_500, letterSpacing: '0.16em' }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

/** Thin vertical rule between stats — cheaper and cleaner than full borders. */
function Rule() {
  return <div style={{ display: 'flex', width: 1, height: 46, backgroundColor: ZINC_700 }} />
}

/** How far up the target ladder this signal got, as a glanceable strip. */
function Ladder({ reached, total, awaiting }: { reached: number; total: number; awaiting?: boolean }) {
  const label = awaiting ? 'awaiting first target' : `${reached} of ${total} targets reached`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'flex', width: 46, height: 12, borderRadius: 3,
              backgroundColor: i < reached ? GOLD : 'rgba(255,255,255,0.16)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 17, color: ZINC_500, marginLeft: 8 }}>{label}</span>
    </div>
  )
}

/**
 * Perforated seam: the result half is the torn-off end of a receipt, and the
 * notches say so at a glance. Two rules make it work — the notches are painted
 * AFTER the band (Satori paints in document order, so a preceding row is simply
 * covered) and they are offset so the band's top edge runs through their middle.
 */
function Perforation() {
  const count = 46
  return (
    <div style={{ position: 'absolute', top: -8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, height: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: 'flex', width: 13, height: 16, borderRadius: 8, backgroundColor: BG }} />
      ))}
    </div>
  )
}

/**
 * Oversized, barely-there mark bled off the right edge. It is what keeps the
 * trade half from reading as empty margin without competing with the numbers.
 */
function Watermark({ logo }: { logo?: string }) {
  if (!logo) return null
  return (
    <div style={{ position: 'absolute', right: -66, top: 46, display: 'flex', opacity: 0.055 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} width={310} height={310} alt="" />
    </div>
  )
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function SignalCard({ model, logo }: CardProps) {
  const badge = SIDE_BADGE[model.side]
  const isLong = model.side === 'long'
  const sideLabel = isLong ? 'LONG' : 'SHORT'
  const metaText = `${model.exchangeTimeframe}  ·  ${model.firedText}`
  const entryText = `$${model.entryText}`
  const stopText = `$${model.stopText}`
  const ink = INK[model.tone]

  return (
    <div style={{ position: 'relative', width: 1200, height: 630, display: 'flex', flexDirection: 'column', backgroundColor: BG, fontFamily: FONT }}>
      {/* ── Trade half ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, padding: '34px 60px 0' }}>
        {/* Faint diagonal weave: enough to stop the panel reading as flat black
            at thumbnail size, invisible as texture at full size. */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 2px, rgba(255,255,255,0) 2px, rgba(255,255,255,0) 12px)' }} />
        <Watermark logo={logo} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Lockup logo={logo} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                borderWidth: 2, borderStyle: 'solid', borderColor: badge.border, backgroundColor: badge.bg,
                borderRadius: 8, padding: '8px 18px',
              }}
            >
              <Chevron up={isLong} color={badge.fg} weight={5} />
              <span style={{ fontSize: 26, fontWeight: 700, color: badge.fg, letterSpacing: '0.04em' }}>{sideLabel}</span>
            </div>
            <span style={{ fontSize: 15, color: ZINC_500, letterSpacing: '0.14em' }}>RECORDED AT FIRE TIME</span>
          </div>
        </div>

        <div style={{ display: 'flex', borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: ZINC_700, marginTop: 20 }} />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontSize: 96, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.035em', lineHeight: 1 }}>
              {model.symbol}
            </span>
            <span style={{ fontSize: 34, color: ZINC_500 }}>/ USDT</span>
          </div>
          <span style={{ fontSize: 21, color: ZINC_400, letterSpacing: '0.04em' }}>{metaText}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
            <Stat label="ENTRY" value={entryText} />
            <Rule />
            <Stat label="STOP" value={stopText} tone="down" />
            <Rule />
            <Stat label="RISK" value={model.riskText} />
            <Rule />
            <Stat label="TRACKED" value={model.heldText} />
          </div>
        </div>

        {/* Pinned to the seam rather than centred: centring pushed the ladder
            under the band on the tallest content. */}
        <div style={{ display: 'flex', paddingBottom: 22 }}>
          <Ladder reached={model.reached} total={model.total} awaiting={model.awaiting} />
        </div>
      </div>

      {/* ── Result half ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', display: 'flex', height: 212 }}>
        <div
          style={{
            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between',
            backgroundImage: BAND[model.tone], padding: '0 60px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 46, fontWeight: 700, color: ink, letterSpacing: '0.02em' }}>{model.outcomeLabel}</span>
            <span style={{ fontSize: 23, color: ink, opacity: 0.82 }}>{model.outcomeDetail}</span>
            <span style={{ fontSize: 21, color: ink, opacity: 0.72, marginTop: 8 }}>{model.url}</span>
            <span style={{ fontSize: 16, color: ink, opacity: 0.62 }}>Not financial advice</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            {model.tone === 'win' || model.tone === 'loss' ? (
              <Chevron up={model.tone === 'win'} color={ink} weight={11} />
            ) : null}
            <span style={{ fontSize: 132, fontWeight: 700, color: ink, letterSpacing: '-0.04em' }}>{model.moveText}</span>
          </div>
        </div>
        <Perforation />
      </div>

      {/* Brand hairline along the very top edge, painted last so nothing covers
          it. It is the one element that appears on every card, which is what
          makes a screenshot recognisable as ours at a glance. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5,
        backgroundImage: 'linear-gradient(90deg, #b07d10 0%, #f0c04a 45%, #d4a017 100%)' }} />
    </div>
  )
}

/**
 * Used when a receipt is unknown or still open: branded, never broken. It has to
 * sell the method on its own, because it is also the card Google and X show for
 * every /signals URL that is not a finished receipt.
 */
export function FallbackCard({ url, logo }: { url: string; logo?: string }) {
  const chips = ['ENTRY STAMPED AT FIRE', 'STOP RECORDED', 'TARGETS FIXED', 'RESULT PUBLISHED']
  return (
    <div style={{ position: 'relative', width: 1200, height: 630, display: 'flex', flexDirection: 'column', backgroundColor: BG, fontFamily: FONT }}>
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, padding: '34px 60px 24px' }}>
        <Watermark logo={logo} />
        <Lockup logo={logo} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
          <span style={{ fontSize: 82, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.03em' }}>Verified results</span>
          <span style={{ fontSize: 28, color: ZINC_400 }}>
            Every signal recorded at fire time and published unedited.
          </span>
          <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: 'flex', backgroundColor: 'rgba(212,160,23,0.10)', borderWidth: 1,
                  borderStyle: 'solid', borderColor: 'rgba(212,160,23,0.35)', borderRadius: 6, padding: '9px 16px',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: '0.1em' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 112, backgroundImage: BAND.gold, padding: '0 60px' }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: INK.gold }}>{url}</span>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5,
        backgroundImage: 'linear-gradient(90deg, #b07d10 0%, #f0c04a 45%, #d4a017 100%)' }} />
    </div>
  )
}

/**
 * Filename-safe tag for a rendered card — used by the preview harness so the
 * PNGs it writes are self-describing.
 */
export function cardFilename(model: SignalCardModel): string {
  return model.url.split('/').pop() || 'signals'
}
