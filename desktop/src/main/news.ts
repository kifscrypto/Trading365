import { createHash } from 'node:crypto'
import type { NewsItem, SourceHealth } from '../shared/types'

const feeds = [
  { id: 'coindesk', label: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { id: 'cointelegraph', label: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
]
const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'HYPE', 'ZEC', 'PUMP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'ATOM', 'NEAR', 'SUI', 'SEI', 'ARB', 'OP', 'INJ', 'AAVE', 'UNI', 'LTC', 'BCH', 'ETC', 'FIL', 'TRX', 'TON']

function decode(value: string): string {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)))
    return entities[entity.toLowerCase()] ?? match
  })
}

function text(value: string): string {
  return decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function field(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
    if (match) return match[1].trim()
  }
  return ''
}

function linkFor(block: string): string {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)
  return atom?.[1] ?? field(block, ['link', 'guid'])
}

function categoryFor(value: string): NewsItem['category'] {
  if (/funding|liquidat|open interest|perpetual|futures|derivatives/i.test(value)) return 'derivatives'
  if (/fed\b|cpi\b|inflation|dollar|bond|treasury|interest rate|central bank|macro|etf\b|sec\b/i.test(value)) return 'macro'
  if (/upgrade|mainnet|launch|integrat|partnership|governance|protocol|token unlock|airdrop/i.test(value)) return 'projects'
  return 'markets'
}

export function parseRss(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []
  return blocks.map(block => {
    const title = text(field(block, ['title']))
    const url = text(linkFor(block))
    const publishedRaw = text(field(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']))
    const publishedAt = new Date(publishedRaw)
    if (!title || !url.startsWith('https://') || Number.isNaN(publishedAt.getTime())) return null
    const summary = text(field(block, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 600)
    const haystack = `${title} ${summary}`
    return {
      id: createHash('sha1').update(url).digest('hex'), title, url, source,
      publishedAt: publishedAt.toISOString(), summary,
      tags: symbols.filter(symbol => new RegExp(`\\b${symbol}\\b`, 'i').test(haystack)),
      category: categoryFor(haystack),
    }
  }).filter((item): item is NewsItem => item !== null)
}

export async function fetchNews(): Promise<{ items: NewsItem[]; sources: SourceHealth[] }> {
  const results = await Promise.allSettled(feeds.map(async feed => {
    const response = await fetch(feed.url, { headers: { 'User-Agent': 'T365-Desk/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error(`${response.status} from ${feed.label}`)
    return { feed, items: parseRss(await response.text(), feed.label) }
  }))
  const items: NewsItem[] = []
  const sources: SourceHealth[] = []
  results.forEach((result, index) => {
    const feed = feeds[index]
    if (result.status === 'fulfilled') {
      items.push(...result.value.items)
      sources.push({ id: feed.id, label: feed.label, status: 'ok', lastSuccess: new Date().toISOString(), message: null })
    } else sources.push({ id: feed.id, label: feed.label, status: 'error', lastSuccess: null, message: (result.reason as Error).message })
  })
  const unique = new Map<string, NewsItem>()
  for (const item of items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const key = item.url || `${item.source}:${item.title.toLowerCase()}`
    if (!unique.has(key)) unique.set(key, item)
  }
  return { items: [...unique.values()].slice(0, 60), sources }
}
