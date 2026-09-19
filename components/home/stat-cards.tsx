"use client"

import { useEffect, useState } from 'react'

export interface StatItem {
  label: string
  /** Raw number to count up to. null renders an em dash — never a zero. */
  value: number | null
  /** 'pct' → one decimal. 'int' → thousands-separated integer. */
  format: 'pct' | 'int'
  /**
   * Prefix a "+" on positive values. Only correct for genuinely signed metrics
   * like expectancy — a hit rate is not signed, and rendering it as "+63.5%"
   * made the homepage disagree with /scanner on the same aggregate.
   */
  signed?: boolean
  /** Small tag under the number, e.g. "0 DELETED". */
  tag?: string
  /** Context line, e.g. "of N resolved". */
  sub?: string
  /** The headline card gets the green treatment. */
  primary?: boolean
}

function formatValue(n: number, format: 'pct' | 'int', signed: boolean): string {
  if (format === 'int') return Math.round(n).toLocaleString('en-US')
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function StatCard({ item }: { item: StatItem }) {
  // NO COUNT-UP. These cards used to animate from 0 to the real value on first
  // view, and that animation was itself the bug report: a screenshot taken
  // mid-flight showed "40.5%" beside the caption "691 of 1089 resolved", which
  // reads as a wrong denominator rather than as an animation frame. The tell was
  // the ratio — 40.5/63.5 and 1447/2265 are both 0.639, the same frame.
  //
  // The whole claim of this site is that its numbers are checkable, so a number
  // that is briefly WRONG on screen is worse than no animation at all. The value
  // now renders at its true figure on the server and never moves.
  const body = item.value === null ? '—' : formatValue(item.value, item.format, item.signed ?? false)

  return (
    <div
      className="t-panel rounded-[10px] border t-line p-5"
      style={
        item.primary
          ? {
              borderColor: 'color-mix(in oklab, var(--t-green) 40%, transparent)',
              boxShadow: '0 0 44px -12px color-mix(in oklab, var(--t-green) 45%, transparent)',
            }
          : undefined
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] t-dim">{item.label}</p>
      <p
        className={`mt-2 font-mono text-3xl font-bold tabular-nums sm:text-4xl ${
          item.primary ? 't-green' : 'text-[var(--t-tx)]'
        }`}
      >
        {body}
      </p>
      {item.sub && <p className="mt-1 font-mono text-[10px] tracking-wider t-dim">{item.sub}</p>}
      {item.tag && (
        <p className="mt-2 inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider t-line t-dim">
          {item.tag}
        </p>
      )}
    </div>
  )
}

/**
 * "UPDATED N MIN AGO" is measured from when the server actually rendered this
 * page, passed in as a prop — not typed in. It is client-only because the value
 * changes over time and rendering it during SSR would be stale on arrival.
 */
function UpdatedAgo({ renderedAt }: { renderedAt: number }) {
  const [mins, setMins] = useState<number | null>(null)

  useEffect(() => {
    const calc = () => setMins(Math.max(0, Math.floor((Date.now() - renderedAt) / 60_000)))
    calc()
    const id = setInterval(calc, 30_000)
    return () => clearInterval(id)
  }, [renderedAt])

  return (
    <p className="mt-4 text-center font-mono text-[10px] tracking-[0.12em] t-dim">
      UPDATED {mins === null ? '—' : `${mins} MIN AGO`} · SAME AGGREGATES AS THE PUBLIC ARCHIVE
    </p>
  )
}

export function BigStats({ items, renderedAt }: { items: StatItem[]; renderedAt: number }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <StatCard key={item.label} item={item} />
        ))}
      </div>
      <UpdatedAgo renderedAt={renderedAt} />
    </div>
  )
}
