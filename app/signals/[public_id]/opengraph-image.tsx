import { ImageResponse } from 'next/og'
import { getReceipt, displayPair, fmtPrice, fmtPct, fmtUtc, type Receipt } from '@/lib/signals/public'

// Social card for a signal receipt, 1200×630.
//
// Two-tone by design: a dark upper half carries the identity and the trade, and
// the RESULT sits on a solid outcome-coloured band. Dark cards disappear in a
// feed thumbnail and the old card buried the number the whole thing exists to
// show, so the move is the largest element on the image.
//
// NEVER THROWS: a failure here would break the social preview for every page
// that embeds it, so any missing/unresolved receipt falls back to a branded
// neutral card.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 verified signal receipt'

const GOLD = '#d4a017'
const BG = '#09090b'
const ZINC_500 = '#71717a'
const ZINC_400 = '#a1a1aa'

// Outcome-coded accents. A dark card vanishes in a feed thumbnail, so the result
// sits on a SOLID colour block: green for a target hit, red for a stop, grey for
// an unresolved signal. Band text is near-black, which is the highest-contrast
// pairing and survives being scaled down to a timeline thumbnail.
const ACCENT = {
  win: '#22c55e',
  loss: '#f43f5e',
  neutral: '#64748b',
} as const
const ON_ACCENT = '#08130b'

function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: size, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>TRADING</span>
      <span style={{ fontSize: size, fontWeight: 700, color: GOLD, letterSpacing: '-0.01em' }}>365</span>
    </div>
  )
}

/** Which targets were reached, as a glanceable progress strip. */
function Ladder({ reached, total }: { reached: number; total: number }) {
  // Pre-built string: Satori rejects an element with multiple child nodes, so
  // "{reached} of {total} targets" (text + expression + text) cannot be inline.
  const label = `${reached} of ${total} targets`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', width: 44, height: 10, borderRadius: 6,
            backgroundColor: i < reached ? GOLD : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
      <span style={{ color: ZINC_500, fontSize: 18, marginLeft: 10, letterSpacing: '0.02em' }}>{label}</span>
    </div>
  )
}

export default async function Image({ params }: { params: Promise<{ public_id: string }> }) {
  const { public_id } = await params
  const r: Receipt | null = await getReceipt(public_id).catch(() => null)

  // Unresolved or unknown signals keep a branded neutral card rather than a
  // broken preview.
  if (!r || r.status === 'fired') {
    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: 'flex', flexDirection: 'column', backgroundColor: BG, fontFamily: 'sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '52px 64px 36px' }}>
            <Wordmark />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
              <span style={{ color: '#ffffff', fontSize: 78, fontWeight: 700, letterSpacing: '-0.02em' }}>Verified results</span>
              <span style={{ color: ZINC_400, fontSize: 28, marginTop: 14 }}>
                Every signal recorded at fire time and published unedited.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: 104, backgroundColor: ACCENT.neutral, padding: '0 64px' }}>
            <span style={{ color: ON_ACCENT, fontSize: 28, fontWeight: 700 }}>trading365.org/signals</span>
          </div>
        </div>
      ),
      size,
    )
  }

  const isShort = r.side === 'short'
  const won = r.status.startsWith('tp')
  const accent = won ? ACCENT.win : r.status === 'sl' ? ACCENT.loss : ACCENT.neutral
  const totalTargets = isShort ? 5 : 3
  const reached = won ? Number(r.status.slice(2)) : 0
  const outcomeLabel = won
    ? `TP${reached} HIT`
    : r.status === 'sl' ? 'STOPPED OUT' : 'NO TARGET OR STOP IN 48H'
  const moveText = r.move_pct != null ? fmtPct(r.move_pct) : '—'
  const url = `trading365.org/signals/${r.public_id}`
  // Every value below is built as ONE string. Satori throws on an element with
  // more than one child node, so mixed text + expressions must be pre-joined.
  const metaLine = `${r.exchange.toUpperCase()} · ${r.timeframe} · ${fmtUtc(r.fired_at, false)}`
  const entryText = `$${fmtPrice(r.entry_price)}`
  const stopText = r.stop_price ? `$${fmtPrice(r.stop_price)}` : '—'

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', flexDirection: 'column', backgroundColor: BG, fontFamily: 'sans-serif' }}>
        {/* ── Top: identity and the trade ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 64px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span
                style={{
                  color: isShort ? '#fca5a5' : '#86efac', fontSize: 24, fontWeight: 700,
                  borderWidth: 2, borderStyle: 'solid', borderColor: isShort ? ACCENT.loss : ACCENT.win,
                  backgroundColor: isShort ? 'rgba(244,63,94,0.16)' : 'rgba(34,197,94,0.16)',
                  borderRadius: 10, padding: '8px 20px', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}
              >
                {isShort ? 'Short' : 'Long'}
              </span>
              <span style={{ color: ZINC_400, fontSize: 22 }}>{metaLine}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
              <span style={{ color: '#ffffff', fontSize: 104, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {displayPair(r.symbol)}
              </span>
              <span style={{ color: ZINC_500, fontSize: 32 }}>/ USDT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ color: ZINC_400, fontSize: 28 }}>Entry</span>
                <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700 }}>{entryText}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ color: ZINC_400, fontSize: 28 }}>Stop</span>
                <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700 }}>{stopText}</span>
              </div>
            </div>
            <Ladder reached={reached} total={totalTargets} />
          </div>
        </div>

        {/* ── Bottom: the result, on a solid colour block so it shouts ──── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: 232, backgroundColor: accent, padding: '0 64px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ color: ON_ACCENT, fontSize: 34, fontWeight: 700, letterSpacing: '0.06em' }}>{outcomeLabel}</span>
            <span style={{ color: ON_ACCENT, fontSize: 22, opacity: 0.78 }}>{url}</span>
            <span style={{ color: ON_ACCENT, fontSize: 19, opacity: 0.7 }}>Not financial advice</span>
          </div>
          <span style={{ color: ON_ACCENT, fontSize: 130, fontWeight: 700, letterSpacing: '-0.04em' }}>{moveText}</span>
        </div>
      </div>
    ),
    size,
  )
}
