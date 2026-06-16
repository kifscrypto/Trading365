// Referral / affiliate links + pair deep-links per exchange.
// Shared by the short (entries) and long (long-entries) Telegram alert routes.

// Registration referral links (lowercase exchange keys).
const EXCHANGE_REFERRAL: Record<string, string> = {
  bitunix:     'https://www.bitunix.com/register?vipCode=VP7Q',
  bingx:       'https://bingx.com/en/partner/KIFSCrypto',
  weex:        'https://www.weex.com/en/register?vipCode=cx5n',
  hyperliquid: 'https://app.hyperliquid.xyz/join/TRADING365',
  okx:         'https://okx.com/join/42956024',
  mexc:        'https://www.mexc.com/?shareCode=mexc-KIFSCrypto',
}

// Homepage fallbacks (no referral code) for exchanges we don't have a link for.
const EXCHANGE_HOMEPAGE: Record<string, string> = {
  bitunix:     'https://www.bitunix.com',
  bingx:       'https://bingx.com',
  weex:        'https://www.weex.com',
  hyperliquid: 'https://app.hyperliquid.xyz',
  okx:         'https://www.okx.com',
  mexc:        'https://www.mexc.com',
  bybit:       'https://www.bybit.com',
  blofin:      'https://blofin.com',
  coinex:      'https://www.coinex.com',
}

/** Registration referral link, or the exchange homepage if we have no referral for it. */
export function exchangeReferralUrl(exchange: string): string {
  const ex = exchange.toLowerCase()
  return EXCHANGE_REFERRAL[ex] ?? EXCHANGE_HOMEPAGE[ex] ?? `https://www.${ex}.com`
}

/**
 * Deep-link to the specific perpetual pair page (with referral) where the exchange
 * supports direct pair URLs, otherwise the registration referral link.
 * `symbol` is the stored form, e.g. 'BTCUSDT'.
 */
export function exchangeTradeLink(exchange: string, symbol: string): string {
  const ex  = exchange.toLowerCase()
  const sym = symbol.toUpperCase() // e.g. BTCUSDT
  switch (ex) {
    case 'bitunix': return `https://www.bitunix.com/futures/USDT/${sym}?vipCode=VP7Q`
    case 'bingx':   return `https://bingx.com/en/futures/${sym}/?invite=Trading365`
    default:        return exchangeReferralUrl(ex)
  }
}
