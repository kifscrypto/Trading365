"use client"

import { useEffect, useRef, useState } from 'react'

export interface StatItem {
  label: string
  /** Raw number to count up to. null renders an em dash — never a zero. */
  value: number | null
  /** 'pct' → signed, one decimal. 'int' → thousands-separated integer. */
  format: 'pct' | 'int'
  /** Small tag under the number, e.g. "0 DELETED". */
  tag?: string
  /** Context line, e.g. "of N resolved". */
  sub?: string
  /** The headline card gets the green treatment. */
  primary?: boolean
}

function formatValue(n: number, format: 'pct' | 'int'): string {
  if (format === 'int') return Math.round(n).toLocaleString('en-US')
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

const COUNT_MS = 900

function StatCard({ item }: { item: StatItem }) {
  // The server renders the FINAL number. The count-up only rewinds it to zero
  // once the card is in view, which means the first client render is identical
  // to the server HTML — no hydration mismatch — and a visitor who never
  // scrolls here still sees the true figure.
  const [shown, setShown] = useState<number | null>(item.value)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || item.value === null || started.current) return
    // Respect the OS setting: show the final figure and skip the animation.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return
        started.current = true
        io.disconnect()
        const target = item.value as number
        const t0 = performance.now()
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / COUNT_MS)
          const eased = 1 - Math.pow(1 - p, 3)
          setShown(target * eased)
          if (p < 1) requestAnimationFrame(step)
          else setShown(target)
        }
        requestAnimationFrame(step)
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [item.value])

  const body = shown === null ? '—' : formatValue(shown, item.format)

  return (
    <div
      ref={ref}
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
