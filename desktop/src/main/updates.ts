import type { UpdateInfo } from '../shared/types'

const DEFAULT_FEED_URL = 'https://trading365.org/api/desk/version'
const DEFAULT_PAGE_URL = 'https://trading365.org/desk'
const ALLOWED_HOST = /(^|\.)trading365\.org$/i
const TIMEOUT_MS = 8000

function versionParts(version: string): Array<number | string> {
  return version.trim().replace(/^v/i, '').split(/[.\-+]/).filter(Boolean)
    .map(part => (/^\d+$/.test(part) ? Number(part) : part))
}

// Best-effort semver-ish comparison. Numeric segments compare numerically, and a
// release outranks a pre-release of the same core version.
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate)
  const now = versionParts(current)
  for (let index = 0; index < Math.max(next.length, now.length); index += 1) {
    const a = next[index] ?? 0
    const b = now[index] ?? 0
    if (a === b) continue
    if (typeof a === 'number' && typeof b === 'number') return a > b
    if (typeof a === 'number') return true
    if (typeof b === 'number') return false
    return String(a) > String(b)
  }
  return false
}

function allowedUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Best-effort check against the published version feed. This never throws and
 * never blocks the app: an offline or malformed response simply yields null.
 */
export async function checkForUpdate(
  currentVersion: string,
  feedUrl = process.env.DESK_UPDATE_URL || DEFAULT_FEED_URL,
): Promise<UpdateInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(feedUrl, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) return null
    const data = await response.json() as Record<string, unknown>
    const latestVersion = typeof data.version === 'string' ? data.version.trim() : ''
    if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return null
    return {
      currentVersion,
      latestVersion,
      downloadUrl: allowedUrl(data.downloadUrl) ?? DEFAULT_PAGE_URL,
      pageUrl: allowedUrl(data.pageUrl) ?? DEFAULT_PAGE_URL,
      notes: typeof data.notes === 'string' ? data.notes.slice(0, 280) : null,
      releasedAt: typeof data.releasedAt === 'string' ? data.releasedAt : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
