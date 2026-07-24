// Maps an outbound URL's host to the exchange/merchant it belongs to.
// Pure (no Node APIs) so it can run in the browser click tracker AND on the server.
// A subdomain suffix match covers partner.*/go.*/proinvite.* affiliate hosts.

const DOMAIN_MAP: readonly [string, string][] = [
  ["bybit.com", "Bybit"],
  ["bydfi.com", "BYDFi"],
  ["kraken.com", "Kraken"],
  ["blofin.com", "BloFin"],
  ["mexc.com", "MEXC"],
  ["bingx.com", "BingX"],
  ["bitunix.com", "Bitunix"],
  ["coinex.com", "CoinEx"],
  ["toobit.com", "Toobit"],
  ["xt.com", "XT.com"],
  ["weex.com", "WEEX"],
  ["kcex.com", "KCEX"],
  ["okx.com", "OKX"],
  ["kucoin.com", "KuCoin"],
  ["gate.io", "Gate.io"],
  ["ourbit.com", "Ourbit"],
  ["btcc.com", "BTCC"],
  ["novava.com", "Novava"],
  ["binance.com", "Binance"],
  ["yubit.com", "Yubit"],
  ["coinbase.com", "Coinbase"],
]

// Hosts whose brand isn't a clean registrable domain (affiliate/redirect hosts).
const KEYWORD_MAP: readonly [string, string][] = [
  ["bitget", "Bitget"],
  ["primexbt", "PrimeXBT"],
  ["lbank", "LBank"],
  ["hyperliquid", "Hyperliquid"],
]

/** Returns the exchange name for an outbound affiliate URL, or null if it isn't one. */
export function exchangeFromUrl(rawUrl: string): string | null {
  let host = ""
  try {
    // base ignored for absolute URLs; relative/internal links resolve to a dummy host and never match
    host = new URL(rawUrl, "https://internal.invalid").hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host || host === "internal.invalid") return null
  for (const [domain, name] of DOMAIN_MAP) {
    if (host === domain || host.endsWith("." + domain)) return name
  }
  for (const [keyword, name] of KEYWORD_MAP) {
    if (host.includes(keyword)) return name
  }
  return null
}

export function isAffiliateOutbound(rawUrl: string): boolean {
  return exchangeFromUrl(rawUrl) !== null
}
