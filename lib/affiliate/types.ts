// Shared types for the affiliate-commission API adapters.

// Credentials an adapter needs. Not every field applies to every exchange —
// `AffiliateAdapter.fields` declares which the UI should collect.
export interface AffiliateCreds {
  key: string
  secret: string
  passphrase?: string
  // Free-form extras keyed by field name (e.g. { uid: '123' }).
  extra?: Record<string, string>
}

// One coin-denominated commission figure. An adapter may return several (e.g.
// Bybit reports per-coin; CoinEx returns USDT + CET). The caller sums them after
// converting each to USD, so mixed-currency commissions are handled correctly.
export interface CommissionComponent {
  amount: number
  currency: string
}

export interface CommissionReading {
  components: CommissionComponent[]
  referrals?: number | null
  // Human label describing what window the figure covers ("lifetime",
  // "last 365d", "last 30d", "2026-07", …) — shown on the dashboard.
  periodLabel?: string | null
  // Raw provider payload, stored on the snapshot for debugging / correction.
  raw?: unknown
}

export type CredField = 'key' | 'secret' | 'passphrase' | 'uid'

export interface AffiliateAdapter {
  slug: string
  label: string
  // Which credential inputs the admin form should show for this exchange.
  fields: CredField[]
  // Shown in the UI: where to create the key / what tier is required.
  approvalNote?: string
  fetchCommission(creds: AffiliateCreds): Promise<CommissionReading>
}
