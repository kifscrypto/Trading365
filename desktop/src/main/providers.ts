import type { Candle, Exchange, MarketAsset, MarketContext, SourceHealth } from '../shared/types'
import { calcEMA } from './indicators'

const HEADERS = { 'User-Agent': 'T365-Terminal/1.0', 'Accept': 'application/json' }
const OKX = 'https://www.okx.com'
const HL = 'https://api.hyperliquid.xyz/info'
const excluded = new Set(['XAUT', 'XBT', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME', 'BOME', 'NEIRO', 'POPCAT', 'TURBO', 'GOAT', 'PNUT', 'LUNC', 'DEGEN'])
const nonCrypto = new Set(['EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'GOLD', 'XAG', 'SILVER', 'WTI', 'BRENT', 'USOIL', 'UKOIL', 'CL', 'COPPER', 'XCU', 'TSLA', 'SPCX', 'SNDK', 'INTC', 'MU', 'NVDA', 'AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'MSFT', 'MSTR', 'COIN', 'HOOD', 'PLTR', 'GME', 'AMC', 'NFLX', 'AMD'])

export function validCryptoSymbol(symbol: string): boolean {
  const base = symbol.toUpperCase().replace(/[-_]/g, '').replace(/SWAP$/, '').replace(/(USDT|USDC|BUSD)$/, '')
  return /^[A-Z0-9]+$/.test(base) && !base.startsWith('1000') && !base.includes('STOCK') && !excluded.has(base) && !nonCrypto.has(base) && !/\d(L|S)$/.test(base)
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init?.headers }, signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${new URL(url).hostname}`)
  return response.json() as Promise<T>
}

function okxCandle(row: string[]): Candle {
  return { time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }
}

function hlCandle(row: { t: number; o: string; h: string; l: string; c: string; v: string }): Candle {
  return { time: row.t, open: Number(row.o), high: Number(row.h), low: Number(row.l), close: Number(row.c), volume: Number(row.v) }
}

export async function getCandles(exchange: Exchange, symbol: string, interval: '1h' | '4h' | '1d'): Promise<Candle[]> {
  if (exchange === 'okx') {
    const bar = interval === '1h' ? '1H' : interval === '4h' ? '4H' : '1D'
    const limit = interval === '1d' ? 210 : 200
    const data = await fetchJson<{ data: string[][] }>(`${OKX}/api/v5/market/candles?instId=${symbol}-USDT-SWAP&bar=${bar}&limit=${limit}`)
    return data.data.map(okxCandle).reverse()
  }
  const duration = interval === '1h' ? 36e5 : interval === '4h' ? 144e5 : 864e5
  const endTime = Date.now()
  const data = await fetchJson<Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>>(HL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin: symbol, interval, startTime: endTime - duration * 210, endTime } }),
  })
  return data.map(hlCandle)
}

interface OkxTicker { instId: string; last: string; open24h: string; volCcy24h: string }
interface OkxOi { instId: string; oiCcy: string }

export async function getOkxUniverse(limit = 8): Promise<MarketAsset[]> {
  const [tickers, openInterest] = await Promise.all([
    fetchJson<{ data: OkxTicker[] }>(`${OKX}/api/v5/market/tickers?instType=SWAP`),
    fetchJson<{ data: OkxOi[] }>(`${OKX}/api/v5/public/open-interest?instType=SWAP`),
  ])
  const oi = new Map(openInterest.data.map(row => [row.instId, Number(row.oiCcy)]))
  const candidates = tickers.data.filter(row => {
    if (!row.instId.endsWith('-USDT-SWAP')) return false
    const symbol = row.instId.replace('-USDT-SWAP', '')
    const baseExcluded = ['BTC', 'ETH'].includes(symbol)
    const price = Number(row.last)
    const oiUsd = (oi.get(row.instId) ?? 0) * price
    return (baseExcluded || (validCryptoSymbol(symbol) && oiUsd >= 20_000_000)) && Number(row.volCcy24h) > 0
  }).sort((a, b) => Number(b.volCcy24h) - Number(a.volCcy24h))
  const selected = [...candidates.filter(row => ['BTC-USDT-SWAP', 'ETH-USDT-SWAP'].includes(row.instId)), ...candidates.filter(row => !['BTC-USDT-SWAP', 'ETH-USDT-SWAP'].includes(row.instId)).slice(0, limit)]
  return Promise.all(selected.map(async row => {
    const symbol = row.instId.replace('-USDT-SWAP', '')
    const price = Number(row.last)
    const [candles4h, funding] = await Promise.all([
      getCandles('okx', symbol, '4h'),
      fetchJson<{ data: Array<{ fundingRate: string }> }>(`${OKX}/api/v5/public/funding-rate?instId=${row.instId}`).catch(() => ({ data: [{ fundingRate: '0' }] })),
    ])
    return {
      symbol, exchange: 'okx' as const, price,
      change24h: (price - Number(row.open24h)) / Number(row.open24h) * 100,
      funding: Number(funding.data[0]?.fundingRate ?? 0),
      openInterest: (oi.get(row.instId) ?? 0) * price,
      volume24h: Number(row.volCcy24h), candles4h,
    }
  }))
}

interface HlMeta { universe: Array<{ name: string }> }
interface HlContext { funding: string; openInterest: string; markPx: string; dayNtlVlm: string; prevDayPx: string }

async function getHlMeta(): Promise<[HlMeta, HlContext[]]> {
  return fetchJson<[HlMeta, HlContext[]]>(HL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  })
}

export async function getHyperliquidUniverse(limit = 8): Promise<MarketAsset[]> {
  const [meta, contexts] = await getHlMeta()
  const candidates = meta.universe.map((asset, index) => ({ asset, context: contexts[index] })).filter(({ asset, context }) => {
    return !['BTC', 'ETH'].includes(asset.name) && validCryptoSymbol(asset.name) && Number(context.openInterest) * Number(context.markPx) >= 10_000_000 && Number(context.dayNtlVlm) > 0
  }).sort((a, b) => Number(b.context.dayNtlVlm) - Number(a.context.dayNtlVlm)).slice(0, limit)
  return Promise.all(candidates.map(async ({ asset, context }) => {
    const price = Number(context.markPx)
    const previous = Number(context.prevDayPx)
    return {
      symbol: asset.name, exchange: 'hyperliquid' as const, price,
      change24h: previous ? (price - previous) / previous * 100 : 0,
      funding: Number(context.funding) * 8,
      openInterest: Number(context.openInterest) * price,
      volume24h: Number(context.dayNtlVlm),
      candles4h: await getCandles('hyperliquid', asset.name, '4h'),
    }
  }))
}

export async function monitorPrice(exchange: Exchange, symbol: string): Promise<number> {
  if (exchange === 'okx') {
    const data = await fetchJson<{ data: Array<{ last: string }> }>(`${OKX}/api/v5/market/ticker?instId=${symbol}-USDT-SWAP`)
    const price = Number(data.data[0]?.last)
    if (!price) throw new Error(`No OKX price for ${symbol}`)
    return price
  }
  const [meta, contexts] = await getHlMeta()
  const index = meta.universe.findIndex(asset => asset.name === symbol)
  const price = Number(contexts[index]?.markPx)
  if (index < 0 || !price) throw new Error(`No Hyperliquid price for ${symbol}`)
  return price
}

export async function getMarketContext(): Promise<{ context: MarketContext; sources: SourceHealth[] }> {
  const now = new Date().toISOString()
  const sources: SourceHealth[] = []
  const [okxResult, globalResult, fngResult] = await Promise.allSettled([
    Promise.all([getCandles('okx', 'BTC', '4h'), getCandles('okx', 'ETH', '4h'), fetchJson<{ data: OkxTicker[] }>(`${OKX}/api/v5/market/tickers?instType=SWAP`)]),
    fetchJson<{ data: { market_cap_percentage: { btc: number } } }>('https://api.coingecko.com/api/v3/global'),
    fetchJson<{ data: Array<{ value: string; value_classification: string }> }>('https://api.alternative.me/fng/?limit=1'),
  ])
  const context: MarketContext = { btcPrice: null, ethPrice: null, btcChange24h: null, ethChange24h: null, btcDominance: null, fearGreed: null, fearGreedLabel: null, regime: 'unknown', regimeDistance: null }
  if (okxResult.status === 'fulfilled') {
    const [btc, eth, tickers] = okxResult.value
    const btcPrice = btc.at(-1)?.close ?? null
    const ethPrice = eth.at(-1)?.close ?? null
    context.btcPrice = btcPrice
    context.ethPrice = ethPrice
    for (const [symbol, price] of [['BTC', btcPrice], ['ETH', ethPrice]] as const) {
      const ticker = tickers.data.find(row => row.instId === `${symbol}-USDT-SWAP`)
      if (ticker && price) {
        const change = (price - Number(ticker.open24h)) / Number(ticker.open24h) * 100
        if (symbol === 'BTC') context.btcChange24h = change
        else context.ethChange24h = change
      }
    }
    if (btcPrice && btc.length >= 50) {
      const ema50 = calcEMA(btc.map(candle => candle.close), 50).at(-1)!
      const distance = (btcPrice - ema50) / ema50
      context.regimeDistance = distance * 100
      context.regime = distance > .01 ? 'uptrend' : distance < -.01 ? 'downtrend' : 'neutral'
    }
    sources.push({ id: 'okx', label: 'OKX public data', status: 'ok', lastSuccess: now, message: null })
  } else sources.push({ id: 'okx', label: 'OKX public data', status: 'error', lastSuccess: null, message: (okxResult.reason as Error).message })
  if (globalResult.status === 'fulfilled') {
    context.btcDominance = globalResult.value.data.market_cap_percentage.btc
    sources.push({ id: 'coingecko', label: 'CoinGecko global data', status: 'ok', lastSuccess: now, message: null })
  } else sources.push({ id: 'coingecko', label: 'CoinGecko global data', status: 'error', lastSuccess: null, message: (globalResult.reason as Error).message })
  if (fngResult.status === 'fulfilled') {
    context.fearGreed = Number(fngResult.value.data[0]?.value)
    context.fearGreedLabel = fngResult.value.data[0]?.value_classification ?? null
    sources.push({ id: 'fng', label: 'Alternative.me sentiment', status: 'ok', lastSuccess: now, message: null })
  } else sources.push({ id: 'fng', label: 'Alternative.me sentiment', status: 'error', lastSuccess: null, message: (fngResult.reason as Error).message })
  return { context, sources }
}
