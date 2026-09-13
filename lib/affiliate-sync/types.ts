export type AdapterCreds = { apiKey: string; apiSecret?: string; passphrase?: string }

export type AdapterResult = {
  totalUsd: number                       // final USD figure to snapshot
  referrals?: number                     // invitee count if the API exposes it
  breakdown: { currency: string; amount: number; usd: number }[]
  raw: unknown                           // trimmed raw response for raw_json
}

export type Adapter = (creds: AdapterCreds) => Promise<AdapterResult>
