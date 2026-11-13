/**
 * Social card for /terminal — 1200×630, rendered by Satori through next/og.
 *
 * WHY A PURPOSE-BUILT CARD
 * The generic /api/og card only had a title on black, which made the product
 * look as empty as the card. This one sells the thing: a headline, the four
 * capabilities, a mock of the workstation itself, and the price on the brand
 * band. It is the first thing most people see before they ever visit the page.
 *
 * Pure component on purpose (same contract as lib/og/signal-card.tsx): a
 * pre-built model in, pixels out — no database, no environment — so
 * scripts/og-preview.mjs can render it offline before a deploy.
 *
 * SATORI RULES: every element with children needs `display: flex`; an element
 * may hold one text child, so mixed text must be joined into one string first;
 * `img` needs explicit width/height and only takes data URIs / absolute URLs;
 * nothing here may throw (the caller guards the logo).
 */

const GOLD = '#d4a017'
const GOLD_LIGHT = '#f0c04a'
const BG = '#09090b'
const PANEL = '#0d1219'
const LINE = '#1e2733'
const ZINC_400 = '#a1a1aa'
const ZINC_500 = '#71717a'
const GREEN = '#3df08a'
const FONT = 'Noto Sans'

const BAND_GOLD = 'linear-gradient(100deg, #f5d57a 0%, #d4a017 55%, #b07d10 100%)'
const INK_GOLD = '#1a1206'

/** A plausible rising session, so the chart reads as a chart, not as noise. */
const DEFAULT_BARS = [34, 40, 37, 48, 44, 56, 51, 60, 57, 68, 63, 72, 69, 79, 74, 83, 80, 89, 85, 94, 90, 100]

export interface DeskCardProps {
  /** Square PNG data URI for the brand mark. Omit and the card still renders. */
  logo?: string
  headline?: string
  subhead?: string
  chips?: string[]
  price?: string
  priceNote?: string
  url?: string
  bars?: number[]
}

/** Mark + wordmark + product line, as one lockup. */
function Lockup({ logo }: { logo?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={62} height={62} alt="" />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>TRADING</span>
          <span style={{ fontSize: 32, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: '-0.01em' }}>365</span>
        </div>
        <span style={{ fontSize: 14, color: ZINC_500, letterSpacing: '0.24em' }}>T365 TERMINAL · WINDOWS</span>
      </div>
    </div>
  )
}

/** A faux workstation: symbol header, a rising bar chart, and three read-outs. */
function Workstation({ bars }: { bars: number[] }) {
  const chartHeight = 168
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', width: 496, gap: 16,
        borderWidth: 1, borderStyle: 'solid', borderColor: LINE, borderRadius: 16,
        backgroundColor: PANEL, padding: '20px 22px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>BTC / USDT</span>
          <span style={{ fontSize: 14, color: ZINC_500, letterSpacing: '0.14em' }}>OKX · 4H MODEL</span>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(61,240,138,0.35)',
            backgroundColor: 'rgba(61,240,138,0.12)', borderRadius: 8, padding: '6px 12px',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: GREEN }}>+2.4%</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: chartHeight }}>
        {bars.map((value, index) => (
          <div
            key={index}
            style={{
              display: 'flex', width: 14, height: Math.max(8, Math.round((value / 100) * chartHeight)),
              borderRadius: 3,
              backgroundImage: index === bars.length - 1
                ? BAND_GOLD
                : 'linear-gradient(180deg, rgba(61,240,138,0.9) 0%, rgba(61,240,138,0.25) 100%)',
            }}
          />
        ))}
      </div>

      {/* Read-outs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: LINE, paddingTop: 14 }}>
        {[['SCANNER', '8 assets'], ['REGIME', 'Uptrend'], ['WATCHLIST', '3 saved']].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: ZINC_500, letterSpacing: '0.14em' }}>{label}</span>
            <span style={{ fontSize: 19, fontWeight: 700, color: '#ffffff' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DeskCard({
  logo,
  headline = 'Every tool. One terminal. Yours.',
  subhead = 'Scanner, charts, news and alerts in one Windows app. Pay once. Nothing to renew.',
  chips = ['SCANNER', 'CHARTS', 'NEWS', 'ALERTS'],
  price = '$299 once',
  priceNote = 'Own it · every future version · 7-day free trial',
  url = 'trading365.org/terminal',
  bars = DEFAULT_BARS,
}: DeskCardProps) {
  return (
    <div style={{ position: 'relative', width: 1200, height: 630, display: 'flex', flexDirection: 'column', backgroundColor: BG, fontFamily: FONT }}>
      {/* Faint diagonal weave: stops the panel reading as flat black at thumbnail size. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
        backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 2px, rgba(255,255,255,0) 2px, rgba(255,255,255,0) 12px)' }} />
      {/* Gold corner glows. */}
      <div style={{ position: 'absolute', top: -140, right: -120, width: 480, height: 480, borderRadius: '50%', backgroundColor: 'rgba(212,160,23,0.10)', display: 'flex' }} />
      <div style={{ position: 'absolute', bottom: 40, left: -160, width: 360, height: 360, borderRadius: '50%', backgroundColor: 'rgba(212,160,23,0.05)', display: 'flex' }} />

      {/* Body */}
      <div style={{ position: 'relative', display: 'flex', flex: 1, alignItems: 'center', gap: 46, padding: '46px 60px 30px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
          <Lockup logo={logo} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 64, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.04 }}>{headline}</span>
            <span style={{ fontSize: 23, color: ZINC_400, lineHeight: 1.4 }}>{subhead}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {chips.map((chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex', backgroundColor: 'rgba(212,160,23,0.10)', borderWidth: 1,
                  borderStyle: 'solid', borderColor: 'rgba(212,160,23,0.35)', borderRadius: 6, padding: '8px 15px',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: '0.1em' }}>{chip}</span>
              </div>
            ))}
          </div>
        </div>

        <Workstation bars={bars} />
      </div>

      {/* Price band */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 104, backgroundImage: BAND_GOLD, padding: '0 60px' }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: INK_GOLD, letterSpacing: '-0.02em' }}>{price}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: INK_GOLD }}>{url}</span>
          <span style={{ fontSize: 15, color: INK_GOLD, opacity: 0.78 }}>{priceNote}</span>
        </div>
      </div>

      {/* Brand hairline, painted last so nothing covers it. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5,
        backgroundImage: 'linear-gradient(90deg, #b07d10 0%, #f0c04a 45%, #d4a017 100%)' }} />
    </div>
  )
}
