/**
 * X (Twitter) posting for signal receipts.
 *
 * Auth is OAuth 1.0a user context — the only scheme that lets a server post AS
 * @Trading365X with four static credentials. The Bearer Token from the developer
 * portal is app-only and cannot post, so it is deliberately not used here.
 *
 * Env:
 *   X_API_KEY / X_API_SECRET            consumer key + secret
 *   X_ACCESS_TOKEN / X_ACCESS_SECRET    user-context token for the posting account
 *   X_POSTING_MODE                      'dry' (default) | 'live' | 'manual'
 *   X_MAX_POSTS_PER_DAY                 default 6
 *   X_MANUAL_TELEGRAM_CHAT_ID           'manual' mode destination (see lib/x-queue.ts)
 *
 * 'manual' exists because X now bills API usage with prepaid credits: the account
 * can hold perfectly valid keys and still be refused with 402 credits-depleted.
 * Manual mode does everything the queue did and stops one step short of posting —
 * the composed text is handed to Telegram for a human to publish. It needs no X
 * credentials at all.
 *
 * Same contract as lib/discord.ts: a notifier must never throw into a scanner
 * cron, so every exported function swallows and reports its own errors.
 */
import { createHmac, randomBytes } from 'node:crypto'

const TWEETS_URL = 'https://api.twitter.com/2/tweets'
const X_CRED_KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] as const

export type PostingMode = 'dry' | 'live' | 'manual'

export function postingMode(): PostingMode {
  const raw = (process.env.X_POSTING_MODE ?? '').trim().toLowerCase()
  if (raw === 'live') return 'live'
  if (raw === 'manual') return 'manual'
  return 'dry'
}

export function maxPostsPerDay(): number {
  const n = Number(process.env.X_MAX_POSTS_PER_DAY ?? 6)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6
}

/** All four user-context credentials present? Missing = notifier is a no-op. */
export function xConfigured(): boolean {
  return X_CRED_KEYS.every((k) => !!process.env[k])
}

/**
 * RFC 3986 percent-encoding as OAuth requires. encodeURIComponent leaves
 * !'()* unescaped and those MUST be escaped, or the signature base string
 * differs from the server's and every request 401s.
 */
function pe(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export interface OAuthHeaderOptions {
  /** Injectable for deterministic tests — otherwise generated per request. */
  nonce?: string
  timestamp?: string
  method?: string
  url?: string
}

/**
 * Build the OAuth 1.0a Authorization header for a JSON POST.
 *
 * A JSON body is NOT part of the signature base string (only form-encoded
 * bodies are), so the parameter set is the oauth_* values alone. The
 * `nonce`/`timestamp` inputs exist so the signature can be checked against the
 * reference implementation with identical inputs.
 */
export function buildOAuthHeader(opts: OAuthHeaderOptions = {}): string {
  const method = opts.method ?? 'POST'
  const url = opts.url ?? TWEETS_URL
  const nonce = opts.nonce ?? randomBytes(16).toString('hex')
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000))

  const params: Record<string, string> = {
    oauth_consumer_key: process.env.X_API_KEY ?? '',
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: process.env.X_ACCESS_TOKEN ?? '',
    oauth_version: '1.0',
  }

  // Base string: METHOD & encoded(url) & encoded(sorted key=value pairs)
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pe(k)}=${pe(params[k])}`)
    .join('&')
  const baseString = [method.toUpperCase(), pe(url), pe(paramString)].join('&')

  // Signing key: both secrets, each percent-encoded, joined by &
  const signingKey = `${pe(process.env.X_API_SECRET ?? '')}&${pe(process.env.X_ACCESS_SECRET ?? '')}`
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')

  const headerParams: Record<string, string> = { ...params, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pe(k)}="${pe(headerParams[k])}"`)
      .join(', ')
  )
}

export interface PostResult {
  ok: boolean
  /** Tweet id when posted (or a dry-run marker). */
  id?: string
  error?: string
  dry?: boolean
}

/**
 * Post one tweet. Never throws: returns { ok: false, error } instead, so a
 * scanner cron or webhook can treat posting as best-effort.
 *
 * In 'dry' mode nothing is sent — the exact payload is logged, which is how the
 * format and volume were reviewed before any credential existed.
 */
export async function postTweet(text: string): Promise<PostResult> {
  const mode = postingMode()

  if (mode === 'dry') {
    console.log(`[x] DRY RUN — would post (${tweetLength(text)}/280):\n${text}\n---`)
    return { ok: true, id: 'dry-run', dry: true }
  }
  if (!xConfigured()) {
    console.error('[x] credentials not configured — skipping post')
    return { ok: false, error: 'not-configured' }
  }
  if (text.length > 280) {
    // Length is checked here as a backstop; callers should trim first.
    return { ok: false, error: 'too-long' }
  }

  try {
    const res = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: buildOAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = JSON.stringify(body).slice(0, 300)
      console.error(`[x] post failed HTTP ${res.status}: ${detail}`)
      return { ok: false, error: `HTTP ${res.status}: ${detail}` }
    }
    const id = (body as { data?: { id?: string } })?.data?.id
    console.log(`[x] posted tweet ${id}`)
    return { ok: true, id }
  } catch (err) {
    console.error('[x] post failed:', err)
    return { ok: false, error: String(err) }
  }
}

/**
 * Length as X counts it: every URL counts as 23 characters regardless of its
 * real length, so a long receipt path does not eat the budget.
 */
export function tweetLength(text: string): number {
  const urls = text.match(/https?:\/\/\S+/g) ?? []
  return text.replace(/https?:\/\/\S+/g, '').length + urls.length * 23
}

// ── Selection policy (pure, so it can be tested without a database) ─────────
export interface PostCandidate {
  public_id: string
  /** 'tp1'..'tp5' | 'sl' | 'expired' */
  status: string
  /** Absolute move %, used to rank by notability. */
  abs_move: number
}

/**
 * Pick at most `limit` receipts to post.
 *
 * Ordered by the largest absolute move (a −4% stop is as notable as a +4%
 * target), BUT when there is more than one slot to fill, one of them is reserved
 * for a stopped-out signal if one exists. Without that reservation a good day
 * fills every slot with winners and the account becomes a highlight reel — the
 * one thing a track-record account cannot afford to look like. With a single
 * slot, the most notable signal wins outright: posting a loss because it happens
 * to be the only stop is not "honest", it is just arbitrary.
 */
export function choosePosts<T extends PostCandidate>(candidates: T[], limit: number): T[] {
  if (limit <= 0 || candidates.length === 0) return []
  const ranked = [...candidates].sort((a, b) => b.abs_move - a.abs_move)
  const chosen: T[] = []

  if (limit > 1) {
    const loss = ranked.find((c) => c.status === 'sl')
    if (loss) chosen.push(loss)
  }

  for (const c of ranked) {
    if (chosen.length >= limit) break
    if (chosen.some((x) => x.public_id === c.public_id)) continue
    chosen.push(c)
  }
  return chosen.slice(0, limit)
}

// ── Digest ──────────────────────────────────────────────────────────────────
/**
 * Daily aggregate post for the automated queue.
 *
 * NOTE the distinction from buildWeeklyDigestTweet in lib/signal-messages.ts:
 * this is the DAILY digest the cron posts (fired/hit/stopped today, plus the
 * running published count), while the weekly one is the manual cross-post shape
 * that quotes net expectancy. They answer different questions and both exist on
 * purpose — do not collapse them.
 */
export function buildDigestTweet(d: {
  fired: number
  wins: number
  losses: number
  hitRate: string | null
  published: number
  url: string
}): string {
  return [
    '📊 Trading365 — today',
    '',
    `${d.fired} signal${d.fired === 1 ? '' : 's'} fired`,
    `✅ ${d.wins} hit a target`,
    `🛑 ${d.losses} stopped out`,
    ...(d.hitRate ? [`Hit rate ${d.hitRate}`] : []),
    '',
    `${d.published.toLocaleString('en-US')} signals published and counted, never edited:`,
    d.url,
    '',
    'Not financial advice.',
  ].join('\n')
}
