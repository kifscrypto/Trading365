import { ImageResponse } from 'next/og'
import {
  getReceipt, displayPair, sideLabel, STATUS_LABEL, fmtPrice, fmtPct, fmtUtc,
  type Receipt,
} from '@/lib/signals/public'

// Social card for a signal receipt — same brand system as /api/og (gold on
// near-black, 1200×630) so shared receipts look like the rest of the site.
//
// NEVER THROWS: a failure here would break the social preview for every page
// that embeds it, so any missing/unresolved receipt falls back to a branded
// generic card.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 verified signal receipt'

const GOLD = '#d4a017'
const BG = '#09090b'
const ZINC_800 = '#27272a'
const ZINC_500 = '#71717a'
const ZINC_400 = '#a1a1aa'

function Row({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ color: ZINC_500, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color: colour, fontSize: 30, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 1200, height: 630, backgroundColor: BG, display: 'flex', flexDirection: 'column',
        padding: '56px 64px', fontFamily: 'sans-serif',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: GOLD, display: 'flex' }} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: '#ffffff' }}>TRADING</span>
        <span style={{ fontSize: 26, fontWeight: 700, color: GOLD }}>365</span>
      </div>
      {children}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28,
          paddingTop: 18, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: ZINC_800,
        }}
      >
        <span style={{ color: ZINC_500, fontSize: 15 }}>Not financial advice · recorded at fire time, published unedited</span>
        <span style={{ color: ZINC_400, fontSize: 15, fontWeight: 600 }}>trading365.org/signals</span>
      </div>
    </div>
  )
}

export default async function Image({ params }: { params: Promise<{ public_id: string }> }) {
  const { public_id } = await params
  const r: Receipt | null = await getReceipt(public_id).catch(() => null)

  if (!r || r.status === 'fired') {
    return new ImageResponse(
      (
        <Shell>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ color: '#ffffff', fontSize: 56, fontWeight: 700 }}>Signal track record</span>
            <span style={{ color: ZINC_400, fontSize: 26, marginTop: 12 }}>
              Every signal recorded at fire time and published unedited.
            </span>
          </div>
        </Shell>
      ),
      size,
    )
  }

  const isShort = r.side === 'short'
  const won = r.status.startsWith('tp')
  const accent = won ? '#2e9e4f' : r.status === 'sl' ? '#e53935' : ZINC_400
  const resultColour = won ? '#4ade80' : r.status === 'sl' ? '#f87171' : ZINC_400
  const resultText =
    r.status === 'expired' ? 'Expired' : `${STATUS_LABEL[r.status]} ${r.move_pct != null ? fmtPct(r.move_pct) : ''}`.trim()

  return new ImageResponse(
    (
      <Shell>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
          {/* Pair + direction */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ color: '#ffffff', fontSize: 76, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {displayPair(r.symbol)}
            </span>
            <span
              style={{
                color: isShort ? '#f87171' : '#4ade80', fontSize: 22, fontWeight: 700,
                borderWidth: 1, borderStyle: 'solid', borderColor: isShort ? '#e53935' : '#2e9e4f',
                backgroundColor: isShort ? 'rgba(229,57,53,0.12)' : 'rgba(46,158,79,0.12)',
                borderRadius: 8, padding: '6px 16px', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >
              {sideLabel(r.side)}
            </span>
            <span style={{ color: ZINC_400, fontSize: 24 }}>
              {r.exchange.toUpperCase()} · {r.timeframe}
            </span>
          </div>

          {/* The result is the whole point of the card */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ color: resultColour, fontSize: 62, fontWeight: 700 }}>{resultText}</span>
          </div>

          {/* Numbers */}
          <div style={{ display: 'flex', gap: 64, marginTop: 6 }}>
            <Row label="Entry" value={`$${fmtPrice(r.entry_price)}`} colour="#ffffff" />
            <Row label="Stop" value={r.stop_price ? `$${fmtPrice(r.stop_price)}` : '—'} colour={ZINC_400} />
            <Row label="Fired (UTC)" value={fmtUtc(r.fired_at, false)} colour={ZINC_400} />
          </div>
        </div>
      </Shell>
    ),
    size,
  )
}
