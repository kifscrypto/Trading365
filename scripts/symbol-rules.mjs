/**
 * A2 verification: which symbols change pass/fail when the two normalizers are
 * unified and a non-ASCII guard is added to isValidCryptoSymbol().
 *
 * WHY THIS EXISTS
 * A2.3 requires a report of every symbol whose outcome changes, and "there should
 * be none except non-ASCII rejects". That claim is only checkable against the
 * symbols the scanner actually sees, so this pulls the real universe out of the
 * database rather than testing invented tickers.
 *
 * OLD and NEW are computed side by side from first principles, so the diff is
 * available BEFORE the source is touched:
 *   OLD normalizer = the inline regex at app/api/scanner/_core.ts:170
 *   NEW normalizer = the shared normalizeSymbolBase() in _config.ts
 *
 *   node scripts/symbol-rules.mjs
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

// ── OLD: verbatim from app/api/scanner/_core.ts:170 ─────────────────────────
const oldBase = (symbol) =>
  symbol.replace(/USDT$|USDC$|BUSD$|-USDT|-USDC|_USDT/i, '').toUpperCase()

// ── NEW: the shared normalizer that will live in _config.ts ─────────────────
const newBase = (symbol) =>
  symbol.toUpperCase().replace(/[-_]/g, '').replace(/SWAP$/, '').replace(/(USDT|USDC|BUSD)$/, '')

// ── HARD_EXCLUDE: verbatim from app/api/scanner/_core.ts:134 ────────────────
const HARD_EXCLUDE = ['BTC', 'ETH', 'XAUT', 'XBT', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME', 'BOME', 'NEIRO', 'POPCAT', 'TURBO', 'GOAT', 'PNUT', 'LUNC', 'DEGEN']

// ── isValidCryptoSymbol, OLD vs NEW (NEW adds the non-ASCII guard) ──────────
const FOREX_BASES = new Set(['CHF', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CNH', 'HKD', 'SGD', 'MXN', 'TRY', 'ZAR'])
const COMMODITY_BASES = new Set(['XAU', 'GOLD', 'GOLDUST', 'XAG', 'SILVER', 'WTI', 'BRENT', 'USOIL', 'UKOIL', 'CL', 'NG', 'COPPER', 'XCU', 'XPT', 'XPD'])
const EQUITY_BASES = new Set(['TSLA', 'SPCX', 'SNDK', 'INTC', 'MU', 'NVDA', 'AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'MSFT', 'MSTR', 'COIN', 'HOOD', 'PLTR', 'GME', 'AMC', 'NFLX', 'AMD', 'SKHYNIX', 'SAMSUNG', 'ASML', 'IBM', 'NVIDIA', 'ANTHROPIC', 'CRCL', 'BILL', 'DRAM', 'EWY', 'KORU'])
const INDEX_ETF_RE = /^(NAS\d+|SPX\d*|US\d{2,3}|GER\d+|UK\d+|JP\d+|QQQ|TQQQ|SQQQ|SPXL|SPXS|SOXL|SOXS|DJI|DAX|FTSE|NIKKEI)$/
const LEVERAGED_RE = /\d(L|S)$/

function isValid(symbol, { nonAsciiGuard }) {
  if (nonAsciiGuard && /[^\x20-\x7E]/.test(symbol)) return false
  const base = newBase(symbol)
  if (!base) return false
  if (base.startsWith('1000')) return false
  if (base.includes('STOCK')) return false
  if (FOREX_BASES.has(base)) return false
  if (COMMODITY_BASES.has(base)) return false
  if (EQUITY_BASES.has(base)) return false
  if (INDEX_ETF_RE.test(base)) return false
  if (LEVERAGED_RE.test(base)) return false
  return true
}

// ── Real symbol universe ────────────────────────────────────────────────────
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = neon(process.env.DATABASE_URL)

const rows = await sql`
  SELECT symbol, exchange, COUNT(*)::int AS n FROM (
    SELECT symbol, exchange FROM scanner_signals
    UNION ALL SELECT symbol, exchange FROM telegram_alerts
    UNION ALL SELECT symbol, exchange FROM telegram_alerts_long
    UNION ALL SELECT symbol, exchange FROM signal_receipts
  ) u GROUP BY symbol, exchange ORDER BY symbol`
console.log(`universe: ${rows.length} distinct (symbol, exchange) pairs`)

const CASES = [
  '龙蟹USDT', 'BTCUSDT', 'kPEPEUSDT', '1000PEPEUSDT', 'JSTUSDT',
  'BTC_USDT', 'PEPE_USDT', 'DOGE_USDT', 'ETH_USDT', 'SHIB_USDT',
  'BTCUSDT-SWAP', 'PEPEUSDT-SWAP', 'BTCUSDC', 'DOGEUSDC',
]

const all = [...new Set([...rows.map((r) => r.symbol), ...CASES])]

const validChanged = []
const hardChanged = []
for (const s of all) {
  const vOld = isValid(s, { nonAsciiGuard: false })
  const vNew = isValid(s, { nonAsciiGuard: true })
  if (vOld !== vNew) validChanged.push({ symbol: s, old: vOld, new: vNew })

  const hOld = HARD_EXCLUDE.includes(oldBase(s))
  const hNew = HARD_EXCLUDE.includes(newBase(s))
  if (hOld !== hNew) hardChanged.push({ symbol: s, oldBase: oldBase(s), newBase: newBase(s), old: hOld, new: hNew })
}

console.log(`\n=== isValidCryptoSymbol() outcomes that CHANGE: ${validChanged.length} ===`)
console.log(validChanged.length ? JSON.stringify(validChanged, null, 2) : '(none)')

console.log(`\n=== HARD_EXCLUDE membership that CHANGES: ${hardChanged.length} ===`)
console.log(hardChanged.length ? JSON.stringify(hardChanged, null, 2) : '(none)')

console.log('\n=== A2.1 required-unchanged tickers ===')
for (const s of ['BTCUSDT', 'kPEPEUSDT', '1000PEPEUSDT', 'JSTUSDT']) {
  console.log(`  ${s}: old=${isValid(s, { nonAsciiGuard: false })} new=${isValid(s, { nonAsciiGuard: true })}`)
}
console.log(`  WEEX 龙蟹USDT: old=${isValid('龙蟹USDT', { nonAsciiGuard: false })} new=${isValid('龙蟹USDT', { nonAsciiGuard: true })}`)

const newlyRejected = []
for (const r of rows) {
  if (isValid(r.symbol, { nonAsciiGuard: false }) && !isValid(r.symbol, { nonAsciiGuard: true })) {
    newlyRejected.push({ symbol: r.symbol, exchange: r.exchange, n: r.n })
  }
}
console.log(`\n=== LIVE rows newly rejected by isValidCryptoSymbol: ${newlyRejected.length} ===`)
console.log(newlyRejected.length ? JSON.stringify(newlyRejected, null, 2) : '(none)')

const newlyHardExcluded = []
for (const r of rows) {
  if (!HARD_EXCLUDE.includes(oldBase(r.symbol)) && HARD_EXCLUDE.includes(newBase(r.symbol))) {
    newlyHardExcluded.push({ symbol: r.symbol, exchange: r.exchange, n: r.n, base: newBase(r.symbol) })
  }
}
console.log(`\n=== LIVE rows newly HARD_EXCLUDE'd: ${newlyHardExcluded.length} ===`)
console.log(newlyHardExcluded.length ? JSON.stringify(newlyHardExcluded, null, 2) : '(none)')

// ── Confirm the SHIPPED code agrees with the NEW prediction ─────────────────
const { isValidCryptoSymbol, normalizeSymbolBase } = await import('../app/api/scanner/_config.ts')

const mismatches = []
for (const r of rows) {
  const predicted = isValid(r.symbol, { nonAsciiGuard: true })
  const actual = isValidCryptoSymbol(r.symbol)
  if (predicted !== actual) mismatches.push({ symbol: r.symbol, exchange: r.exchange, predicted, actual })
}
console.log(`\n=== shipped isValidCryptoSymbol vs NEW prediction: ${mismatches.length} mismatches ===`)
console.log(mismatches.length ? JSON.stringify(mismatches, null, 2) : '(none — shipped code matches the prediction)')

// The unification is only safe if it does NOT move the base for live symbols.
const baseDivergence = rows.filter((r) => oldBase(r.symbol) !== normalizeSymbolBase(r.symbol))
console.log(`\n=== live symbols where OLD and NEW bases differ: ${baseDivergence.length} ===`)
console.log(baseDivergence.length ? JSON.stringify(baseDivergence.slice(0, 20), null, 2) : '(none)')

console.log('\n=== A2.1 assertions ===')
const assert = (name, ok) => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
assert('WEEX 龙虾USDT rejected', isValidCryptoSymbol('龙虾USDT') === false)
assert('BTCUSDT unchanged (true)', isValidCryptoSymbol('BTCUSDT') === true)
assert('kPEPEUSDT unchanged (true)', isValidCryptoSymbol('kPEPEUSDT') === true)
assert('1000PEPEUSDT unchanged (false)', isValidCryptoSymbol('1000PEPEUSDT') === false)
assert('JSTUSDT unchanged (true)', isValidCryptoSymbol('JSTUSDT') === true)
assert('HARD_EXCLUDE bases still match after unification',
  ['PEPE', 'DOGE', 'BTC', 'SHIB', 'WIF'].every((b) => normalizeSymbolBase(`${b}USDT`) === b))

