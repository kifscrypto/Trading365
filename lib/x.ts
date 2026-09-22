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
 *   X_MAX_POSTS_PER_DAY                 default 3 (receipts; the daily digest is separate)
 *   X_MIN_GAP_MINUTES                   default 300, between receipt posts
 *   X_FIRST_POST_DELAY_MINUTES          default 120, before the day's first receipt
 *   X_RECEIPT_LINKS                     'on' to put a site link on receipts; default
 *                                       'off', because X charges more for link posts
 *                                       and the digest carries the link instead
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

/**
 * Receipts posted per posting day. Default 3.
 *
 * Was 6, which produced up to 7 tweets a day once the daily digest is counted
 * (the digest is NOT capped by this — it has its own once-a-day idempotency), and
 * read as too much for the account. Three receipts plus the digest is 4.
 *
 * Note this is the whole day's allowance, not per run — see the pacing in
 * lib/x-queue.ts.
 */
export function maxPostsPerDay(): number {
  const n = Number(process.env.X_MAX_POSTS_PER_DAY ?? 3)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3
}

/**
 * The UTC hour the daily posting allowance resets. Default 8.
 *
 * THE CAP USED TO RESET AT 00:00 UTC, and that is why the owner saw six messages
 * at 03:00 local time. The window was `date_trunc('day', NOW() AT TIME ZONE
 * 'UTC')`, so the allowance refilled at midnight UTC — 3am in a UTC+3 locale —
 * and all six posts fired in one burst the instant the cron next ran. The
 * 30-minute cron was never the problem; the day boundary was.
 *
 * 08:00 UTC (11:00 local) puts the window in the morning and lines it up with the
 * daily update, which fires at the same hour.
 */
export function dayResetHourUtc(): number {
  const n = Number(process.env.X_DAY_RESET_HOUR_UTC ?? 8)
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 8
}

/**
 * Minimum minutes between receipt posts. Default 300.
 *
 * Without a floor the day's allowance is spent the moment it refills, so the
 * account posted six tweets inside five seconds and then went silent for 24 hours.
 *
 * 300 against the default 3-post allowance spreads the day across three windows —
 * 10:00, 15:00 and 20:00 UTC — instead of clustering everything into the morning
 * and leaving 21 quiet hours. The cron ticks every 30 minutes, so posts land on the
 * nearest half-hour.
 */
export function minGapMinutes(): number {
  const n = Number(process.env.X_MIN_GAP_MINUTES ?? 300)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300
}

/**
 * Minutes after the posting-day start before the FIRST receipt may go out.
 * Default 120.
 *
 * The daily update fires at the posting-day start and is the account's most
 * important post. Without this hold the first receipt landed a second later and
 * competed with it for the same moment; two hours gives the digest the 08:00 slot
 * to itself, after which the day's signals follow.
 *
 * It applies only while no receipt has gone out in the current posting day, so it
 * gates the first post of the day and nothing else.
 */
export function firstPostDelayMinutes(): number {
  const n = Number(process.env.X_FIRST_POST_DELAY_MINUTES ?? 120)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 120
}

/**
 * Whether RECEIPT posts may carry a link to the site. Default 'off'.
 *
 * X charges materially more for a post containing a URL, and receipts are the bulk
 * of what goes out — up to three a day against one digest. A receipt does not need
 * a link: it already states the result, and the archive link rides on the daily
 * digest, which is the post that is actually trying to bring someone to the site.
 *
 * So this defaults OFF and the digest keeps its link unconditionally (see
 * renderXDaily in lib/daily-update.ts, which is not affected by this flag).
 *
 * Set X_RECEIPT_LINKS=on to put links back on receipts once the revenue justifies
 * the extra cost. No code change needed, and the linked text is byte-for-byte what
 * the site posted before this flag existed.
 *
 * Anything other than the exact string 'on' means off, so a typo in the env var
 * fails towards the cheap option rather than the expensive one.
 */
export function receiptLinks(): 'off' | 'on' {
  return process.env.X_RECEIPT_LINKS === 'on' ? 'on' : 'off'
}

/**
 * Start of the current POSTING day — the window the daily cap counts over.
 *
 * Pure and clock-injected so the boundary can be asserted without waiting for it:
 * scripts/x-preview.mjs checks that 07:59 and 08:01 UTC on the same calendar date
 * land in DIFFERENT windows, which is the entire point of the offset.
 */
export function postingDayStart(now: Date, resetHourUtc: number = dayResetHourUtc()): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUtc, 0, 0, 0),
  )
  // Before the reset hour we are still inside YESTERDAY's window.
  if (now.getTime() < start.getTime()) start.setUTCDate(start.getUTCDate() - 1)
  return start
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
  /**
   * X refused on BILLING grounds (HTTP 402 / credits-depleted), not because the
   * request was wrong. Distinguishing this matters: the credentials and the write
   * permission can both be perfect and the account can still be out of prepaid
   * credits, which no code change can fix. Callers surface it as "add credits"
   * rather than "posting failed", which is what sent the owner looking for a bug.
   */
  billingBlocked?: boolean
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
      // 402 / credits-depleted is a BILLING state. Valid credentials plus enabled
      // write access still hit it when the prepaid balance is empty, so it must
      // not be reported as an ordinary failure.
      const billingBlocked =
        res.status === 402 || /credits-depleted|payment required/i.test(detail)
      if (billingBlocked) {
        console.error(
          `[x] BILLING BLOCKED (HTTP ${res.status}) — the X account has no API credits. ` +
            `Credentials and write access are fine; add credits or a plan in the developer portal. ${detail}`,
        )
      } else {
        console.error(`[x] post failed HTTP ${res.status}: ${detail}`)
      }
      return { ok: false, error: `HTTP ${res.status}: ${detail}`, billingBlocked }
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
  /**
   * Absolute move %.
   *
   * CAREFUL: for a TP hit this records the TARGET distance, not the move achieved
   * — every TP5 is exactly 8.0, so this CANNOT rank two winners against each
   * other. Only losses vary (a stop sits wherever the setup put it). Kept for
   * ranking losses and as a deterministic last-resort tiebreak.
   */
  abs_move: number
  /**
   * Peak favourable excursion %. The only metric that varies WITHIN a TP tier, so
   * it is what actually distinguishes one winner from another.
   */
  mfe_pct: number | null
  /**
   * Hours from fire to close. The "speed" dimension: the same target hit in 90
   * minutes is a far better post than one ground out over 31 hours.
   */
  hours_to_close: number | null
}

/** Tiers big enough to carry a "fired and hit it fast" post. */
const FAST_WIN_MIN_TIER = 4

const tierOf = (status: string): number =>
  status.startsWith('tp') ? Number(status.slice(2)) || 0 : 0

/** Peak MFE, with a missing value ranked below every real one. */
const peakOf = (c: PostCandidate): number =>
  typeof c.mfe_pct === 'number' && Number.isFinite(c.mfe_pct) ? c.mfe_pct : Number.NEGATIVE_INFINITY

/** Hours to close, with a missing value ranked below every real one. */
const speedOf = (c: PostCandidate): number =>
  typeof c.hours_to_close === 'number' && Number.isFinite(c.hours_to_close)
    ? c.hours_to_close
    : Number.POSITIVE_INFINITY

// Explicit comparisons rather than subtraction: two missing values would subtract
// to NaN, and a NaN comparator makes Array.sort silently return an arbitrary order.
//
// EVERY ranking ends with byId. Without a final tiebreak a tie is resolved by input
// order — and input order is whatever the SQL happened to return — so a tie made the
// pick non-deterministic between runs. Caught by check-x-selection.mjs, which found
// two losses both at exactly -4.00 (ake and g) and the chosen one flipping when the
// pool was reversed. That is the same class of bug as the one this policy exists to
// fix, so it is worth being pedantic about it here.
const byId = (a: PostCandidate, b: PostCandidate): number =>
  a.public_id < b.public_id ? -1 : a.public_id > b.public_id ? 1 : 0

const byPeak = (a: PostCandidate, b: PostCandidate): number => {
  const pa = peakOf(a), pb = peakOf(b)
  return pa === pb ? byId(a, b) : pb > pa ? 1 : -1
}
const bySpeed = (a: PostCandidate, b: PostCandidate): number => {
  const sa = speedOf(a), sb = speedOf(b)
  return sa === sb ? byId(a, b) : sa < sb ? -1 : 1
}
const byAbsMove = (a: PostCandidate, b: PostCandidate): number =>
  b.abs_move - a.abs_move || byId(a, b)

/**
 * One loss, chosen AT RANDOM.
 *
 * Deliberately not the biggest. The day's worst loss is the single most damaging
 * thing the account could publish, and posting it every day would make the feed a
 * worst-case highlight reel — the mirror image of the winners-only feed this
 * reservation exists to prevent. A random draw is an unbiased sample of the day's
 * losses, which is what "here is one that didn't work" is actually claiming.
 *
 * `random` is injectable so the behaviour can be asserted without a flaky test.
 */
const pickLoss = <T extends PostCandidate>(losses: T[], random: () => number): T | undefined => {
  if (losses.length === 0) return undefined
  // Sorted by id BEFORE drawing, so the draw is uniform over the SET of losses rather
  // than over whatever order the SQL happened to return rows in. Without this the same
  // random value picks a different receipt when the row order changes, which makes the
  // choice depend on the database's convenience — the same class of accident that made
  // the old ranking pick the slowest signal.
  const ordered = [...losses].sort(byId)
  // Clamped: a custom random() returning exactly 1 would otherwise index past the end.
  const i = Math.min(ordered.length - 1, Math.floor(random() * ordered.length))
  return ordered[i]
}

/**
 * Pick at most `limit` receipts to post.
 *
 * THE RANKING THAT USED TO BE HERE DID NOT RANK ANYTHING. It sorted by `abs_move`,
 * but for a TP hit `move_pct` holds the TARGET distance rather than the move
 * achieved — so on 2026-09-21 all 30 TP5s were exactly 8.0 and the sort was a
 * 30-way tie. The tie was then broken by recency (candidatePool's `closed_at
 * DESC`), and because a signal that closed LATER is one that took LONGER, the
 * account systematically published its SLOWEST wins: it posted two +8% signals
 * that had taken 31.2 and 27.9 hours, while the same day held one that did +8% in
 * 1.4 hours. "Most notable" was picking the worst of the best. Nothing caught it,
 * because a plausible-looking post still came out the other end.
 *
 * The three slots, in order:
 *   1. one LOSS, picked at random — credibility. Random rather than biggest on
 *      purpose: see pickLoss.
 *   2. the FASTEST big win — highest tier reached, shortest time to close. This is
 *      the story a subscriber actually buys: how quickly the thing pays.
 *   3. the highest PEAK win — the largest excursion, the only number that tells one
 *      TP5 from another.
 *
 * `needLoss` exists because the batch is recomputed on EVERY run, from a pool that
 * still contains losses. Pacing releases one post per run, and slot 1 is always the
 * loss, so a 3-cap day published loss, loss, win — two losses, one winner, the
 * exact opposite of the intent. The caller passes needLoss: false once a loss has
 * gone out today, which makes the day's composition stable no matter how many runs
 * it is spread across. Verified by scripts/check-x-selection.mjs.
 *
 * With a single slot the most notable WIN takes it outright. Reserving that slot
 * for a loss would not be honest, just arbitrary — a loss is only worth posting
 * because it sits beside the wins.
 *
 * Any further slots fill by peak, then by abs_move so the result stays
 * deterministic. Never returns the same receipt twice.
 */
export function choosePosts<T extends PostCandidate>(
  candidates: T[],
  limit: number,
  opts: { needLoss?: boolean; random?: () => number } = {},
): T[] {
  if (limit <= 0 || candidates.length === 0) return []

  // Defaults preserve the reserved-loss policy for any caller that does not say.
  const needLoss = opts.needLoss ?? true
  const random = opts.random ?? Math.random

  const chosen: T[] = []
  const taken = new Set<string>()
  const take = (c: T | undefined): boolean => {
    if (!c || taken.has(c.public_id)) return false
    taken.add(c.public_id)
    chosen.push(c)
    return true
  }

  const wins = candidates.filter((c) => c.status.startsWith('tp'))
  const losses = candidates.filter((c) => c.status === 'sl')

  if (limit === 1) {
    take([...wins].sort(byPeak)[0])
    if (chosen.length === 0) take(pickLoss(losses, random))
    if (chosen.length === 0) take([...candidates].sort(byAbsMove)[0])
    return chosen
  }

  // Slot 1 — one loss, at random, and ONLY IF the day has not already published
  // one. `needLoss` is what makes the day's composition correct: the batch is
  // recomputed on every run from a pool that still contains losses, so without
  // this flag a 3-cap day published loss, loss, win — because the pacing now
  // releases one post per run and slot 1 is always the loss.
  if (needLoss) take(pickLoss(losses, random))

  // Slot 2 — the fastest win worth posting. Falls back to any win when the day
  // never reached the fast tier, so a quiet day still posts a winner.
  if (chosen.length < limit) {
    const big = wins.filter((c) => tierOf(c.status) >= FAST_WIN_MIN_TIER)
    take([...(big.length > 0 ? big : wins)].sort(bySpeed)[0])
  }

  // Slot 3 — the highest peak.
  if (chosen.length < limit) take([...wins].sort(byPeak)[0])

  // Remaining slots, and the whole path for a day with no winners at all (which
  // posts its next-biggest losses rather than nothing).
  const rest = [...candidates].sort((a, b) => byPeak(a, b) || byAbsMove(a, b))
  for (const c of rest) {
    if (chosen.length >= limit) break
    take(c)
  }

  return chosen.slice(0, limit)
}

// ── Digest ──────────────────────────────────────────────────────────────────
/**
 * The daily digest moved to renderXDaily() in lib/daily-update.ts.
 *
 * It was a fourth parallel implementation: its own COUNT query, over the
 * IN-PROGRESS day, with wording and numbers that could differ from the Telegram
 * and Discord posts describing the same 24 hours. All three now render from one
 * aggregate, and the day reported is the one that ENDED.
 *
 * buildWeeklyDigestTweet in lib/signal-messages.ts is NOT affected — it is the
 * manual weekly cross-post that quotes net expectancy, which is a different
 * question and still exists on purpose.
 */
