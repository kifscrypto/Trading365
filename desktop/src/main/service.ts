import { dialog, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppState, MarketAsset, Signal, SourceHealth } from '../shared/types'
import { Store } from './store'
import { getCandles, getHyperliquidUniverse, getMarketContext, getOkxUniverse, monitorPrice } from './providers'
import { evaluateEntry, outcomeAtPrice, scoreLong, scoreShort } from './scanner'
import { fetchNews } from './news'
import { parseIcs } from './calendar'
import { verifyLicenseKey } from './license'

type Notify = (title: string, body: string) => void

export class AppService {
  private active = false
  private timers: NodeJS.Timeout[] = []

  constructor(private readonly store: Store, private readonly notify: Notify = () => {}) {}

  private assertLive(): void {
    if (!this.store.canUseLiveFeatures()) throw new Error('Your trial has ended. Activate T365 Terminal to continue live scanning.')
  }

  async activateLicense(key: string): Promise<AppState> {
    const record = verifyLicenseKey(key)
    return this.store.update(state => {
      state.licenseRecord = record
      state.message = 'T365 Terminal is activated. Your perpetual licence, including future major versions, is stored locally.'
    })
  }

  private async exclusive<T>(work: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.active) return fallback()
    this.active = true
    try { return await work() }
    finally { this.active = false }
  }

  private staleSources(existing: SourceHealth[], incoming: SourceHealth[]): SourceHealth[] {
    const merged = new Map<string, SourceHealth>()
    for (const source of incoming) {
      const previous = existing.find(item => item.id === source.id)
      const normalized = source.status === 'error' && previous
        ? { ...source, status: 'stale' as const, lastSuccess: previous.lastSuccess }
        : source
      const prior = merged.get(source.id)
      if (!prior || normalized.status === 'ok' || (prior.status !== 'ok' && !prior.lastSuccess)) merged.set(source.id, normalized)
    }
    return [...merged.values()]
  }

  async refreshAll(): Promise<AppState> {
    this.assertLive()
    try { return await this.exclusive(async () => {
      await this.store.update(state => { state.phase = 'refreshing'; state.message = 'Refreshing public market data and news…' })
      const before = this.store.getState()
      const [marketResult, okxResult, hlResult, newsResult] = await Promise.allSettled([
        getMarketContext(), getOkxUniverse(8), getHyperliquidUniverse(8), fetchNews(),
      ])
      const incomingSources: SourceHealth[] = []
      if (marketResult.status === 'fulfilled') incomingSources.push(...marketResult.value.sources)
      else incomingSources.push({ id: 'market', label: 'Market context', status: 'error', lastSuccess: null, message: (marketResult.reason as Error).message })
      let assets: MarketAsset[] = []
      if (okxResult.status === 'fulfilled') {
        assets.push(...okxResult.value)
        incomingSources.push({ id: 'okx', label: 'OKX public data', status: 'ok', lastSuccess: new Date().toISOString(), message: null })
      } else {
        assets.push(...before.assets.filter(asset => asset.exchange === 'okx'))
        incomingSources.push({ id: 'okx', label: 'OKX public data', status: 'error', lastSuccess: null, message: (okxResult.reason as Error).message })
      }
      if (hlResult.status === 'fulfilled') {
        assets.push(...hlResult.value)
        incomingSources.push({ id: 'hyperliquid', label: 'Hyperliquid public data', status: 'ok', lastSuccess: new Date().toISOString(), message: null })
      } else {
        assets.push(...before.assets.filter(asset => asset.exchange === 'hyperliquid'))
        incomingSources.push({ id: 'hyperliquid', label: 'Hyperliquid public data', status: 'error', lastSuccess: null, message: (hlResult.reason as Error).message })
      }
      const regime = marketResult.status === 'fulfilled' ? marketResult.value.context.regime : before.market.regime
      const daily = await Promise.allSettled(assets.map(asset => getCandles(asset.exchange, asset.symbol, '1d')))
      assets = assets.map((asset, index) => {
        const candles = daily[index].status === 'fulfilled' ? daily[index].value : []
        return { ...asset, shortScore: scoreShort(asset, candles, regime), longScore: scoreLong(asset, candles, regime) }
      })
      const successfulNews = newsResult.status === 'fulfilled' && newsResult.value.items.length > 0
      if (newsResult.status === 'fulfilled') incomingSources.push(...newsResult.value.sources)
      else incomingSources.push({ id: 'news', label: 'Publisher RSS', status: 'error', lastSuccess: null, message: (newsResult.reason as Error).message })
      const sources = this.staleSources(before.sources, incomingSources)
      await this.store.update(state => {
        if (assets.length) state.assets = assets
        if (marketResult.status === 'fulfilled') state.market = marketResult.value.context
        if (successfulNews) state.news = newsResult.value.items
        state.sources = sources
        state.lastUpdated = new Date().toISOString()
        state.phase = sources.some(source => source.status === 'error' || source.status === 'stale') ? 'degraded' : 'ready'
        state.message = assets.length ? `${assets.length} assets scanned locally. Some sources may be cached.` : 'No market data is available yet. Check your connection and refresh.'
      })
      await this.runEntries()
      await this.monitorSignals()
      return this.store.getState()
    }, () => this.store.getState())
    } catch (error) {
      await this.store.update(state => {
        state.phase = 'degraded'
        state.message = `Refresh failed: ${(error as Error).message}. Cached data has been preserved.`
      })
      return this.store.getState()
    }
  }

  async runEntries(): Promise<AppState> {
    this.assertLive()
      return this.exclusive(async () => {
      const state = this.store.getState()
      const candidates = state.assets.filter(asset => {
        const long = asset.longScore && !asset.longScore.skip && asset.longScore.adjustedScore >= 8 && state.market.regime === 'uptrend'
        const short = asset.shortScore && !asset.shortScore.skip && asset.shortScore.adjustedScore >= 7 && state.market.regime === 'downtrend'
        return long || short
      })
      for (const asset of candidates) {
        const [dailyResult, hourlyResult] = await Promise.allSettled([
          getCandles(asset.exchange, asset.symbol, '1d'), getCandles(asset.exchange, asset.symbol, '1h'),
        ])
        if (dailyResult.status !== 'fulfilled' || hourlyResult.status !== 'fulfilled') continue
        const directions = asset.exchange === 'okx' && ['BTC', 'ETH'].includes(asset.symbol) ? [] : ['long', 'short'] as const
        for (const side of directions) {
          const fired = evaluateEntry(asset, dailyResult.value, hourlyResult.value, side, state.market.regime, this.store.getState().signals)
          if (!fired) continue
          await this.store.update(current => { current.signals.unshift(fired) })
          if (state.watchlist.includes(asset.symbol)) this.notify(`T365 ${side.toUpperCase()} · ${asset.symbol}`, `Entry ${fired.entry}, stop ${fired.stop}, score ${fired.score}/15`)
        }
      }
      return this.store.getState()
    }, () => this.store.getState())
  }

  async monitorSignals(): Promise<AppState> {
    this.assertLive()
      return this.exclusive(async () => {
      const open = this.store.getState().signals.filter(signal => signal.status === 'open')
      for (const signal of open) {
        try {
          const price = await monitorPrice(signal.exchange, signal.symbol)
          let status = outcomeAtPrice(signal, price)
          if (Date.now() - Date.parse(signal.firedAt) >= 48 * 36e5 && status === 'open') status = 'expired'
          if (status === 'open') {
            await this.store.update(state => {
              const current = state.signals.find(item => item.id === signal.id)
              if (current) current.currentPrice = price
            })
            continue
          }
          await this.store.update(state => {
            const current = state.signals.find(item => item.id === signal.id)
            if (current) { current.status = status; current.currentPrice = price; current.closedAt = new Date().toISOString() }
          })
          if (this.store.getState().alertedSignalIds.includes(signal.id)) this.notify(`${signal.symbol} · ${status.toUpperCase()}`, `Signal resolved at ${price}`)
        } catch { /* A later monitor retries without changing the open record. */ }
      }
      return this.store.getState()
    }, () => this.store.getState())
  }

  async toggleWatchlist(symbol: string): Promise<AppState> {
    this.assertLive()
    return this.store.update(state => {
      const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!normalized) return
      state.watchlist = state.watchlist.includes(normalized)
        ? state.watchlist.filter(item => item !== normalized)
        : [...state.watchlist, normalized]
    })
  }

  async toggleAlert(signalId: string): Promise<AppState> {
    this.assertLive()
    return this.store.update(state => {
      state.alertedSignalIds = state.alertedSignalIds.includes(signalId)
        ? state.alertedSignalIds.filter(id => id !== signalId)
        : [...state.alertedSignalIds, signalId]
    })
  }

  async importCalendar(window: BrowserWindow): Promise<AppState> {
    this.assertLive()
    const result = await dialog.showOpenDialog(window, {
      title: 'Import an iCalendar', properties: ['openFile'], filters: [{ name: 'iCalendar', extensions: ['ics'] }],
    })
    if (result.canceled || !result.filePaths[0]) return this.store.getState()
    return this.importCalendarFile(result.filePaths[0])
  }

  async importCalendarFile(filePath: string): Promise<AppState> {
    this.assertLive()
    const source = path.basename(filePath)
    const events = parseIcs(await fs.readFile(filePath, 'utf8'), source)
    return this.store.update(state => {
      state.events = [...state.events.filter(event => event.source !== source), ...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      state.message = events.length ? `Imported ${events.length} events from ${source}.` : `No valid events found in ${source}.`
    })
  }

  start(publish: (state: AppState) => void): void {
    const run = (work: () => Promise<AppState>) => { void work().then(publish).catch(error => console.error(error)) }
    run(() => this.refreshAll())
    this.timers.push(setInterval(() => run(() => this.refreshAll()), 30 * 60e3))
    this.timers.push(setInterval(() => run(() => this.runEntries()), 15 * 60e3))
    this.timers.push(setInterval(() => run(() => this.monitorSignals()), 5 * 60e3))
  }

  stop(): void {
    this.timers.forEach(timer => clearInterval(timer))
    this.timers = []
  }
}
