import { ImageResponse } from 'next/og'
import {
  getReceipt, displayPair, fmtPrice, fmtPct, fmtUtc, WATCH_WINDOW_HOURS,
  type Receipt,
} from '@/lib/signals/public'
import { brandMark, ogFonts } from '@/lib/og/assets'
import { FallbackCard, SignalCard, type CardTone, type SignalCardModel } from '@/lib/og/signal-card'

// Social card for a signal receipt, 1200×630.
//
// The layout lives in lib/og/signal-card.tsx so it can be rendered offline by
// scripts/og-preview.mjs; this file owns everything that needs a database, the
// filesystem or an environment.
//
// Two-tone by design: a dark upper half carries the identity and the trade, and
// the RESULT sits on a solid outcome-coloured band. Dark cards disappear in a
// feed thumbnail and the old card buried the number the whole thing exists to
// show, so the move is the largest element on the image.
//
// NEVER THROWS: a failure here would break the social preview for every page
// that embeds it, so a missing/unresolved receipt — or an asset that failed to
// trace into the deployment — falls back to a branded neutral card.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trading365 verified signal receipt'

/** Shown when there is no finished receipt to card up. Absolute path on purpose:
 *  the card is a place people screenshot, so it must not read as a relative one. */
const ARCHIVE_URL = 'trading365.org/signals'
// ── Receipt → card model ────────────────────────────────────────────────────
function toneOf(r: Receipt): CardTone {
  if (r.status.startsWith('tp')) return 'win'
  if (r.status === 'sl') return 'loss'
  return 'flat'
}

/** Only the tiers that existed for this book — the long ladder stops at TP3. */
function totalTargets(r: Receipt): number {
  return r.side === 'short' ? 5 : 3
}

function outcomeLabel(r: Receipt): string {
  if (r.status.startsWith('tp')) return `TP${Number(r.status.slice(2))} HIT`
  if (r.status === 'sl') return 'STOPPED OUT'
  return 'NO TARGET IN 48H'
}

function outcomeDetail(r: Receipt): string {
  const total = totalTargets(r)
  if (r.status.startsWith('tp')) {
    const n = Number(r.status.slice(2))
    return n >= total
      ? `All ${total} targets reached · closed at TP${n}`
      : `Target ${n} of ${total} reached · closed at TP${n}`
  }
  if (r.status === 'sl') return 'Invalidation level hit before any target'
  return 'Window closed with neither level touched'
}

/** How long the trade was watched for, to the minute: '2h 14m' / '48m'. An
 *  expired signal never gets a close stamp — the monitor stops looking rather
 *  than closing it — so it reports the window it was watched for instead. */
function heldText(r: Receipt): string {
  if (r.status === 'expired') return `${WATCH_WINDOW_HOURS}h`
  if (!r.closed_at) return '—'
  const ms = new Date(r.closed_at).getTime() - new Date(r.fired_at).getTime()
  if (!isFinite(ms) || ms < 0) return '—'
  const mins = Math.round(ms / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`
}

function modelFor(r: Receipt): SignalCardModel {
  // Stop distance is read from the row rather than assumed — the scanner clamps
  // it per signal. Absolute value: it is a risk size whichever way it was set.
  const stopPct = r.stop_price
    ? Math.abs((Number(r.stop_price) - Number(r.entry_price)) / Number(r.entry_price)) * 100
    : null
  return {
    symbol: displayPair(r.symbol),
    side: r.side,
    exchangeTimeframe: `${r.exchange.toUpperCase()} · ${r.timeframe}`,
    // fmtUtc renders '17 Sep 2026, 03:45 UTC'; the card separates with a mid-dot.
    firedText: fmtUtc(r.fired_at, true).replace(', ', ' · '),
    entryText: fmtPrice(r.entry_price),
    stopText: r.stop_price ? fmtPrice(r.stop_price) : '—',
    riskText: stopPct != null && isFinite(stopPct) ? `${stopPct.toFixed(1)}%` : '—',
    heldText: heldText(r),
    reached: r.status.startsWith('tp') ? Number(r.status.slice(2)) : 0,
    total: totalTargets(r),
    tone: toneOf(r),
    outcomeLabel: outcomeLabel(r),
    outcomeDetail: outcomeDetail(r),
    // An expired signal banked nothing, so it says so instead of printing 0.0%.
    moveText: r.move_pct != null ? fmtPct(r.move_pct) : '—',
    url: `trading365.org/signals/${r.public_id}`,
  }
}
export default async function Image({ params }: { params: Promise<{ public_id: string }> }) {
  const { public_id } = await params
  const logo = brandMark()
  // getReceipt swallows its own failures and returns null, which is exactly the
  // "render the neutral card" signal we want here.
  const row = await getReceipt(public_id)
  // Unresolved ('fired') receipts have no public page, so their card sells the
  // archive instead of advertising a live trade nobody can open.
  const receipt = row && row.status !== 'fired' ? row : null

  try {
    return new ImageResponse(
      receipt
        ? <SignalCard model={modelFor(receipt)} logo={logo} />
        : <FallbackCard url={ARCHIVE_URL} logo={logo} />,
      { ...size, fonts: ogFonts() },
    )
  } catch (err) {
    console.error('[og] card render failed, using the plain fallback:', err)
    return new ImageResponse(<FallbackCard url={ARCHIVE_URL} />, size)
  }
}