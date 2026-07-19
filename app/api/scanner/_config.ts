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

// Non-altcoin symbols we never scan or alert on. Two layers so we stop playing
// whack-a-mole with individual tickers:
//   (1) isValidCryptoSymbol() — pattern-rejects whole CLASSES (forex, commodities,
//       indices/ETFs, leveraged tokens, tokenised equities, 1000x dupes).
//   (2) EXCLUDED_SYMBOLS — explicit one-offs the patterns don't catch.
// Both apply BEFORE scoring (watchlist builders) AND before firing (entry
// triggers), on the short and long sides alike.
const EXCLUDED_SYMBOLS = new Set<string>([
  // Tokenised stocks / indices / ETFs
  'NAS100USDT', 'SPX500USDT', 'QQQSTOCKUSDT', 'SPCXSTOCKUSDT', 'STXSTOCKUSDT',
  'TSLAUSDT', 'SPCXUSDT', 'SNDKUSDT', 'INTCUSDT', 'SOXLUSDT', 'MUUSDT',
  // Forex / FX pairs
  'CHFUSDT', 'EURUSDT', 'GBPUSDT', 'JPYUSDT', 'AUDUSDT', 'NZDUSDT', 'CADUSDT',
  // Gold (XAU / GOLD; GOLDUSTDT is a known exchange/typo variant)
  'XAUUSDT', 'GOLDUSDT', 'GOLDUSTDT',
  // Silver (XAG / SILVER)
  'XAGUSDT', 'SILVERUSDT',
  // Oil (WTI / Brent / US / UK / CL)
  'WTIUSDT', 'BRENTUSDT', 'USOILUSDT', 'UKOILUSDT', 'CLUSDT',
  // Copper
  'COPPERUSDT', 'XCUUSDT',
  // Leveraged / other non-altcoin tokens
  'LABUSDT', 'HUSDT', 'BICOUSDT',
])

// --- Pattern filter (class-level rejection) ---
const FOREX_BASES = new Set<string>([
  'CHF', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CNH', 'HKD', 'SGD', 'MXN', 'TRY', 'ZAR',
])
const COMMODITY_BASES = new Set<string>([
  'XAU', 'GOLD', 'GOLDUST', 'XAG', 'SILVER',
  'WTI', 'BRENT', 'USOIL', 'UKOIL', 'CL', 'NG',
  'COPPER', 'XCU', 'XPT', 'XPD',
])
// Tokenised equities (company tickers) + tokenised single-country/sector ETFs.
// These exchanges (esp. Bitunix) list real-world stocks as USDT perps; they have
// no naming pattern, so confirmed ones are enumerated here. The *STOCK suffix
// forms are caught by the includes('STOCK') test, so they need not all be listed.
const EQUITY_BASES = new Set<string>([
  'TSLA', 'SPCX', 'SNDK', 'INTC', 'MU', 'NVDA', 'AAPL', 'AMZN', 'GOOGL', 'GOOG',
  'META', 'MSFT', 'MSTR', 'COIN', 'HOOD', 'PLTR', 'GME', 'AMC', 'NFLX', 'AMD',
  // Tokenised stocks seen leaking into the crypto scanner (mostly Bitunix):
  'SKHYNIX', 'SAMSUNG', 'ASML', 'IBM', 'NVIDIA', 'ANTHROPIC', 'CRCL', 'BILL', 'DRAM',
  // Tokenised single-country ETFs (South Korea): EWY (iShares), KORU (Direxion 3x)
  'EWY', 'KORU',
])
// Stock indices and leveraged sector ETFs (whole-base match).
const INDEX_ETF_RE = /^(NAS\d+|SPX\d*|US\d{2,3}|GER\d+|UK\d+|JP\d+|QQQ|TQQQ|SQQQ|SPXL|SPXS|SOXL|SOXS|DJI|DAX|FTSE|NIKKEI)$/
// Leveraged tokens, e.g. BTC3L / ETH3S / SOL2L.
const LEVERAGED_RE = /\d(L|S)$/

// Normalise any exchange symbol form to its BASE: HL bare ('BTC'),
// MEXC underscore ('BTC_USDT'), OKX/WEEX/Bitunix ('BTCUSDT'), '-SWAP', etc.
function baseOf(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/[-_]/g, '')
    .replace(/SWAP$/, '')
    .replace(/(USDT|USDC|BUSD)$/, '')
}

/**
 * Allow-by-pattern: true only for symbols that look like a genuine altcoin perp.
 * Rejects whole classes of non-crypto instruments so new junk is filtered without
 * enumerating every ticker.
 */
export function isValidCryptoSymbol(symbol: string): boolean {
  const base = baseOf(symbol)
  if (!base) return false
  if (base.startsWith('1000')) return false   // 1000x-denominated duplicate listings
  if (base.includes('STOCK')) return false    // *STOCK tokenised equities
  if (FOREX_BASES.has(base)) return false
  if (COMMODITY_BASES.has(base)) return false
  if (EQUITY_BASES.has(base)) return false
  if (INDEX_ETF_RE.test(base)) return false
  if (LEVERAGED_RE.test(base)) return false
  return true
}

/**
 * True if a symbol must NOT be scanned/alerted on — the explicit list OR the
 * pattern filter. Tolerant of every exchange's symbol form.
 */
export function isExcludedSymbol(symbol: string): boolean {
  return EXCLUDED_SYMBOLS.has(baseOf(symbol) + 'USDT') || !isValidCryptoSymbol(symbol)
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
