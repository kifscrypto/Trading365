import { UtcClock } from './utc-clock'

/**
 * The first thing on the page: is the scanner running, and in what regime.
 *
 * The regime is passed in from getCurrentRegime(), which reads the
 * market_condition the scanner itself wrote on its most recent scan. It is
 * never recomputed here, so this strip cannot claim a regime the scanner is not
 * actually operating in. A null regime drops the label rather than guessing.
 */
export function StatusStrip({ regime }: { regime: string | null }) {
  const label = regime ? regime.toUpperCase() : null

  return (
    <div className="t-panel border-b t-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 lg:px-6">
        <div className="flex items-center gap-2">
          {/* Two stacked dots: the outer one pulses, the inner one stays solid,
              so the marker reads as "live" without ever disappearing. */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="t365-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--t-green)]" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--t-green)]" />
          </span>
          <span className="font-mono text-[11px] font-medium tracking-[0.14em] t-green">
            SCANNER ACTIVE{label ? ` · ${label}` : ''}
          </span>
        </div>
        <UtcClock />
      </div>
    </div>
  )
}
