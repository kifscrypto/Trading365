import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

/**
 * What the scanner will and will not look at.
 *
 * WHY THIS COMPONENT EXISTS
 * "Every signaled coin clears a liquidity threshold" is the single most useful
 * thing a track record can say about itself — the record is only meaningful if
 * the underlying instruments were tradeable. But it is also the easiest claim on
 * this site to get wrong, so the numbers below are the SHIPPED ones, copied from
 * the scanner's own config, and they are stated as liquidity bars rather than
 * market caps because that is what the code actually enforces.
 *
 * SOURCE OF TRUTH — if either changes, change this file in the same commit:
 *   app/api/scanner/_core.ts    MIN_OI (per-venue liquidity floor)
 *   app/api/scanner/_config.ts  isValidCryptoSymbol() + EXCLUDED_SYMBOLS
 *   app/api/scanner/_core.ts    HARD_EXCLUDE (named meme / non-altcoin bases)
 *
 * There is deliberately NO market-cap floor anywhere in the scanner. A
 * market-cap claim here would be a fabrication, and a track record that
 * fabricates its own methodology has no value at all. Do not add one.
 */

/** Mirror of MIN_OI in app/api/scanner/_core.ts. */
const LIQUIDITY_FLOORS: { venue: string; floor: string; basis: 'open interest' | '24h volume' }[] = [
  { venue: 'OKX', floor: '$20M', basis: 'open interest' },
  { venue: 'Hyperliquid', floor: '$10M', basis: 'open interest' },
  { venue: 'MEXC', floor: '$8M', basis: 'open interest' },
  { venue: 'WEEX', floor: '$5M', basis: '24h volume' },
  { venue: 'Bitunix', floor: '$5M', basis: '24h volume' },
]

export function SignalEligibilityNote({ className = '' }: { className?: string }) {
  return (
    <section
      aria-labelledby="eligibility-heading"
      className={`rounded-xl border border-border bg-muted/30 p-5 ${className}`}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h2 id="eligibility-heading" className="text-sm font-semibold text-foreground">
          What the scanner will look at
        </h2>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        A track record is only worth reading if the instruments behind it were real and tradeable. Every contract below
        had to clear a <span className="text-foreground">minimum liquidity floor</span> at the moment it was scored —
        open interest where the venue publishes it, 24-hour quote volume where it does not:
      </p>

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Venue</th>
              <th className="px-3 py-1.5 font-medium">Floor</th>
              <th className="px-3 py-1.5 font-medium">Measured on</th>
            </tr>
          </thead>
          <tbody>
            {LIQUIDITY_FLOORS.map((f) => (
              <tr key={f.venue} className="border-t border-border">
                <td className="px-3 py-1.5 text-foreground">{f.venue}</td>
                <td className="px-3 py-1.5 font-medium tabular-nums text-foreground">{f.floor}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        On top of that floor, whole classes are rejected before scoring: <span className="text-foreground">leveraged
        tokens</span> (BTC3L, ETH3S), <span className="text-foreground">1000×-denominated duplicates</span>
        (1000PEPE), <span className="text-foreground">tokenised equities</span>, <span className="text-foreground">stock
        indices and sector ETFs</span>, <span className="text-foreground">forex pairs</span> and{' '}
        <span className="text-foreground">commodities</span> (gold, silver, oil, copper). A named list of nineteen
        non-altcoin bases is excluded outright, including BTC, ETH, DOGE, SHIB, PEPE, FLOKI, BONK, WIF, MEME, BOME,
        NEIRO, POPCAT, TURBO, GOAT, PNUT, LUNC and DEGEN.
      </p>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <span className="text-foreground">To be precise about what this is:</span> the gate is a <em>liquidity</em>
        floor, not a market-cap floor. There is no market-cap filter in the scanner, so we do not claim one — a liquid
        contract is what determines whether in and out are both achievable, and that is what the floor measures. Signals
        are technical setups on established perpetual futures, not micro-cap launch calls.
      </p>

      <p className="mt-3 text-xs text-muted-foreground">
        Read the{' '}
        <Link href="/signals" className="underline hover:text-foreground">full verified record</Link>
        {' '}or the{' '}
        <Link href="/scanner" className="underline hover:text-foreground">live scanner</Link>.
      </p>
    </section>
  )
}