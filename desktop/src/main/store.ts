import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppState } from '../shared/types'
import { licenseState } from './license'

const emptyMarket = {
  btcPrice: null,
  ethPrice: null,
  btcChange24h: null,
  ethChange24h: null,
  btcDominance: null,
  fearGreed: null,
  fearGreedLabel: null,
  regime: 'unknown' as const,
  regimeDistance: null,
}

export class Store {
  private state: AppState
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string, appVersion: string) {
    const now = Date.now()
    this.state = {
      schemaVersion: 1,
      appVersion,
      dataFile: filePath,
      phase: 'ready',
      message: null,
      watchlist: ['BTC', 'ETH', 'SOL'],
      alertedSignalIds: [],
      assets: [],
      signals: [],
      news: [],
      events: [],
      market: emptyMarket,
      sources: [],
      lastUpdated: null,
      licenseRecord: null,
      trialStartedAt: new Date(now).toISOString(),
      license: {
        status: 'unconfigured', licenseId: null, updatesUntil: null,
        trialStartedAt: new Date(now).toISOString(), trialEndsAt: new Date(now + 7 * 864e5).toISOString(),
      },
    }
  }

  async load(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as AppState
      if (parsed.schemaVersion !== 1) throw new Error(`Unsupported local data version: ${parsed.schemaVersion}`)
      const migrated = !parsed.trialStartedAt
      // Keep the version of the code that is actually running, not whichever
      // version first wrote this file.
      this.state = { ...this.state, ...parsed, appVersion: this.state.appVersion, dataFile: this.filePath }
      this.state.license = licenseState(this.state)
      if (migrated) await this.write(this.state)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        await this.write(this.state)
        return
      }
      throw new Error(`Could not read local T365 data: ${(error as Error).message}`)
    }
  }

  getState(): AppState {
    const state = structuredClone(this.state)
    state.license = licenseState(state)
    return state
  }

  canUseLiveFeatures(): boolean {
    return ['active', 'trial', 'unconfigured'].includes(this.getState().license.status)
  }

  async update(mutator: (state: AppState) => void): Promise<AppState> {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state)
      mutator(next)
      next.license = licenseState(next)
      await this.write(next)
      this.state = next
    })
    this.queue = operation.then(() => undefined, () => undefined)
    await operation
    return this.getState()
  }

  async exportBackup(destination: string): Promise<void> {
    await this.queue
    await fs.writeFile(destination, JSON.stringify(this.state, null, 2), { encoding: 'utf8', flag: 'wx' })
  }

  private async write(state: AppState): Promise<void> {
    const temporary = `${this.filePath}.tmp`
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
    await fs.rename(temporary, this.filePath)
  }
}
