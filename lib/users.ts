/**
 * Site accounts: email + password auth, sessions, and entitlements.
 *
 * WHY THIS EXISTS
 * Access is tiered ON THE SITE (anonymous → free account → paid), not through
 * Telegram, because most buyers have no Telegram and per-signal email is both
 * expensive and unwanted. This module is the identity layer that the delayed
 * free tier and the paid live tier both sit on.
 *
 * DESIGN NOTES
 *   - No new dependencies: scrypt comes from node:crypto. Passwords are stored as
 *     scrypt$N$r$p$salt$hash and compared with timingSafeEqual.
 *   - The session cookie holds a random 32-byte token. The database stores only
 *     its SHA-256, so a database leak does not hand anyone a usable session.
 *   - Paid status is derived from `entitlements` (written by payment webhooks or
 *     a manual grant) rather than a mutable flag on the user row, so the same
 *     account can be granted access by any processor without a schema change.
 *   - Rate limiting is a table, not Redis: this site has no Redis and a few
 *     indexed counts are plenty at this scale.
 *
 * IMPORTANT: keep this module free of path aliases (@/…) — it is also executed
 * directly by node for verification, which cannot resolve them.
 */
import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

export const sql = neon(process.env.DATABASE_URL!)

export const SESSION_COOKIE = 't365_session'
export const SESSION_DAYS = 30

// Cost parameters. N=16384 keeps a login at roughly 50-100ms on a serverless
// function — slow enough to be expensive to attack, fast enough not to time out.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export const MIN_PASSWORD = 8
const MAX_PASSWORD = 200 // scrypt cost is linear in input; cap it.

export type Tier = 'free' | 'paid'

export interface User {
  id: number
  email: string
  referral_code: string
  referred_by: string | null
  created_at: string
  last_login_at: string | null
}

export interface Account extends User {
  tier: Tier
  /** ISO date the current paid entitlement expires, null for free accounts. */
  paid_until: string | null
}

// ── Crypto / validation ─────────────────────────────────────────────────────
export function normaliseEmail(email: string): string {
  return (email ?? '').trim().toLowerCase()
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function passwordProblem(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
  if (password.length > MAX_PASSWORD) return 'Password is too long.'
  return null
}

/** scrypt$N$r$p$saltB64$hashB64 — self-describing so parameters can change later
 *  without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32)
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = (stored ?? '').split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    })
    // Lengths must match before timingSafeEqual, which throws otherwise.
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Only this hash is stored — never the token itself. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Referral codes are public (they appear in share links), so keep them short,
 *  unambiguous and random: no 0/O/1/I/l. */
export function newReferralCode(): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** IPs are personal data — store a salted hash, never the address. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(`${ip}:${process.env.ADMIN_SESSION_SECRET ?? ''}`).digest('hex')
}

// ─ Schema ──────────────────────────────────────────────────────────────────
let tablesReady = false

/** Idempotent DDL, mirroring setupSubscribersTable() in lib/premium.ts. Neon's
 *  HTTP driver runs one statement per call, so indexes are separate calls. */
export async function setupUserTables(): Promise<void> {
  if (tablesReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      user_agent   TEXT
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS entitlements (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      external_id TEXT,
      granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ,
      CONSTRAINT entitlements_external_uniq UNIQUE (source, external_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS auth_attempts (
      id           BIGSERIAL PRIMARY KEY,
      email        TEXT NOT NULL,
      ip_hash      TEXT,
      success      BOOLEAN NOT NULL DEFAULT FALSE,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions (token_hash)`
  await sql`CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions (expires_at)`
  await sql`CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id)`
  await sql`CREATE INDEX IF NOT EXISTS auth_attempts_recent_idx ON auth_attempts (email, attempted_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON auth_attempts (ip_hash, attempted_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash)`
  tablesReady = true
}

// ── Users ───────────────────────────────────────────────────────────────────
export async function findUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
  await setupUserTables()
  const rows = await sql`
    SELECT id, email, password_hash, referral_code, referred_by, created_at, last_login_at
    FROM users WHERE email = ${email} LIMIT 1
  `
  return (rows[0] as unknown as (User & { password_hash: string })) ?? null
}

/**
 * Create an account. Returns { error: 'exists' } when the email is already
 * registered rather than throwing, so callers don't have to parse driver errors.
 */
export async function createUser(
  email: string,
  password: string,
  referredBy?: string | null,
): Promise<{ user: User } | { error: 'exists' }> {
  await setupUserTables()
  const passwordHash = await hashPassword(password)
  const ref = referredBy ? referredBy.trim().toLowerCase().slice(0, 32) : null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await sql`
        INSERT INTO users (email, password_hash, referral_code, referred_by)
        VALUES (${email}, ${passwordHash}, ${newReferralCode()}, ${ref})
        RETURNING id, email, referral_code, referred_by, created_at, last_login_at
      `
      return { user: rows[0] as unknown as User }
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        const message = String((err as Error).message ?? '')
        // A referral-code collision is astronomically unlikely but recoverable;
        // a duplicate email is a real answer for the caller.
        if (message.includes('referral_code')) continue
        return { error: 'exists' }
      }
      throw err
    }
  }
  throw new Error('Could not allocate a unique referral code')
}

/**
 * User plus their derived tier. `tier` is never stored on the user row — it is
 * computed from entitlements, so any payment source can grant access without a
 * schema change. EXISTS is used rather than MAX(expires_at) so a lifetime grant
 * (expires_at IS NULL) is not mistaken for no entitlement at all.
 */
export async function getAccount(userId: number): Promise<Account | null> {
  await setupUserTables()
  const rows = await sql`
    SELECT u.id, u.email, u.referral_code, u.referred_by, u.created_at, u.last_login_at,
           EXISTS (
             SELECT 1 FROM entitlements e
             WHERE e.user_id = u.id AND e.status = 'active'
               AND (e.expires_at IS NULL OR e.expires_at > NOW())
           ) AS is_paid,
           (SELECT MAX(e.expires_at) FROM entitlements e
             WHERE e.user_id = u.id AND e.status = 'active') AS paid_until
    FROM users u
    WHERE u.id = ${userId}
    LIMIT 1
  `
  const row = rows[0] as unknown as (User & { is_paid: boolean; paid_until: string | null }) | undefined
  if (!row) return null
  const { is_paid, ...user } = row
  return { ...user, tier: is_paid ? 'paid' : 'free' }
}

export async function markLogin(userId: number): Promise<void> {
  try {
    await sql`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ${userId}`
  } catch (err) {
    console.error('[users] markLogin failed:', err)
  }
}

// ─ Sessions ────────────────────────────────────────────────────────────────
/** Manual cookie parsing — works identically in route handlers and middleware,
 *  matching the approach in lib/auth.ts. */
export function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** Cookie attributes for `cookies().set(...)`. Kept here so every sign-in path
 *  sets an identical, hardened cookie. */
export function sessionCookie(token: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    // Default cookie path would be /api/auth (the request's directory), so the
    // browser would never send it to /account or any page that reads it.
    path: '/',
    maxAge,
  }
}

export async function createSession(
  userId: number,
  userAgent?: string | null,
): Promise<{ token: string; maxAge: number }> {
  await setupUserTables()
  const token = newSessionToken()
  // Opportunistic cleanup instead of a dedicated cron: bounded work, and expired
  // rows can never accumulate because every sign-in sweeps them.
  await sql`DELETE FROM user_sessions WHERE expires_at < NOW()`
  await sql`
    INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent)
    VALUES (
      ${userId}, ${hashToken(token)},
      NOW() + (${SESSION_DAYS}::int * INTERVAL '1 day'),
      ${userAgent ? userAgent.slice(0, 255) : null}
    )
  `
  return { token, maxAge: SESSION_DAYS * 24 * 60 * 60 }
}

// ── Password reset ──────────────────────────────────────────────────────────
/**
 * Until this existed, a forgotten password was unrecoverable. There was no reset
 * route, no token table and — because a reset needs a delivery channel — no email
 * transport to send a link with. A member who forgot their password, including one
 * who had paid, was locked out for good and could only be restored by hand-written
 * SQL against `users`.
 *
 * The token handling deliberately mirrors sessions: a 32-byte random value is
 * returned once to the caller, and only its SHA-256 is stored. A database leak
 * therefore does not hand anyone a working reset link, exactly as it does not hand
 * anyone a working session.
 */

/** How long a reset link stays valid. */
export const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60)

/**
 * Minimum minutes between reset emails for one account.
 *
 * Without it this endpoint is an inbox-flooding tool: anyone who knows an address
 * can trigger unlimited mail to it. Deliberately NOT the auth_attempts limiter —
 * recording reset requests as failed logins would let an attacker lock the victim
 * out of signing in by spamming "forgot password", turning a nuisance into a
 * denial of service.
 */
export const RESET_COOLDOWN_MINUTES = Number(process.env.PASSWORD_RESET_COOLDOWN_MINUTES ?? 5)

export interface ResetRequestResult {
  /** True only when the address has an account AND a token was written. */
  created: boolean
  /** The raw token. Returned once, never stored — only its hash is. */
  token?: string
  userId?: number
  /** Why nothing was created, when `created` is false. */
  reason?: 'no-account' | 'cooldown' | 'error'
}

/**
 * Begin a reset for an address. Never throws.
 *
 * Returns `{ created: false }` for an unknown address rather than an error. The
 * route turns that into the SAME response it gives for a known one, so this cannot
 * be used to enumerate which emails are registered — the same reasoning as the
 * single error message on the login route.
 */
export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  try {
    await setupUserTables()
    const user = await findUserByEmail(email)
    if (!user) return { created: false, reason: 'no-account' }

    // Cooldown before anything is written: a second request inside the window
    // leaves the FIRST link valid and sends no second email. The caller returns
    // the same generic success either way, so the difference is not observable.
    const recent = (await sql`
      SELECT 1 AS present FROM password_resets
      WHERE user_id = ${user.id}
        AND created_at > NOW() - (${RESET_COOLDOWN_MINUTES}::int * INTERVAL '1 minute')
      LIMIT 1
    `) as unknown as { present: number }[]
    if (recent.length) return { created: false, reason: 'cooldown' }

    // One live link at a time. Without this, every request mints another valid
    // token and they all stay usable until they expire, so a mailbox full of old
    // reset emails is a mailbox full of working credentials.
    await sql`
      UPDATE password_resets SET used_at = NOW()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `

    const token = newSessionToken()
    await sql`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (
        ${user.id}, ${hashToken(token)},
        NOW() + (${RESET_TTL_MINUTES}::int * INTERVAL '1 minute')
      )
    `
    return { created: true, token, userId: Number(user.id) }
  } catch (err) {
    console.error('[users] requestPasswordReset failed:', err)
    return { created: false, reason: 'error' }
  }
}

export type ResetConsumeResult = 'ok' | 'invalid' | 'expired' | 'used' | 'weak-password'

export interface ResetConsumeOutcome {
  status: ResetConsumeResult
  /** Present only on 'ok' — the confirm route signs this user in. */
  userId?: number
}

/**
 * Redeem a reset token and set a new password. Never throws.
 *
 * The claim is a single UPDATE that both validates and consumes, so two
 * concurrent submissions of the same link cannot both succeed — a check-then-write
 * pair would let a double-click through.
 *
 * On success every existing session for that user is deleted. If the reset was
 * prompted by someone else having access to the account, leaving their session
 * alive would make the reset theatre.
 */
export async function consumePasswordReset(token: string, newPassword: string): Promise<ResetConsumeOutcome> {
  const problem = passwordProblem(newPassword)
  if (problem) return { status: 'weak-password' }
  if (!token) return { status: 'invalid' }

  try {
    await setupUserTables()
    const hash = hashToken(token)

    const claimed = (await sql`
      UPDATE password_resets SET used_at = NOW()
      WHERE token_hash = ${hash} AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id
    `) as unknown as { user_id: number }[]

    const userId = claimed[0]?.user_id
    if (!userId) {
      // Distinguish "expired" and "already used" from "never existed" so the page
      // can tell the user something true instead of a generic failure.
      const [row] = (await sql`
        SELECT used_at, expires_at FROM password_resets WHERE token_hash = ${hash} LIMIT 1
      `) as unknown as { used_at: string | null; expires_at: string }[]
      if (!row) return { status: 'invalid' }
      return { status: row.used_at ? 'used' : 'expired' }
    }

    await sql`
      UPDATE users SET password_hash = ${await hashPassword(newPassword)}, updated_at = NOW()
      WHERE id = ${userId}
    `
    await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`
    return { status: 'ok', userId: Number(userId) }
  } catch (err) {
    console.error('[users] consumePasswordReset failed:', err)
    return { status: 'invalid' }
  }
}

/**
 * The signed-in account for a raw session token, or null. Never throws.
 *
 * Split from getSessionUser so server components (which have the token via
 * next/headers, not a Request) can use it without this module importing Next.
 */
export async function getAccountFromToken(token: string | undefined | null): Promise<Account | null> {
  if (!token) return null
  try {
    await setupUserTables()
    const rows = await sql`
      SELECT s.user_id
      FROM user_sessions s
      WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > NOW()
      LIMIT 1
    `
    const userId = rows[0]?.user_id
    return userId ? await getAccount(Number(userId)) : null
  } catch (err) {
    console.error('[users] getAccountFromToken failed:', err)
    return null
  }
}

export async function getSessionUser(request: Request): Promise<Account | null> {
  return getAccountFromToken(readSessionCookie(request))
}

export async function destroySession(request: Request): Promise<void> {
  const token = readSessionCookie(request)
  if (!token) return
  try {
    await sql`DELETE FROM user_sessions WHERE token_hash = ${hashToken(token)}`
  } catch (err) {
    console.error('[users] destroySession failed:', err)
  }
}

/** Sign out everywhere (used on password change / suspected compromise). */
export async function destroyAllSessions(userId: number): Promise<void> {
  await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`
}

// ── Rate limiting ───────────────────────────────────────────────────────────
const ATTEMPT_WINDOW_MIN = 15
const MAX_FAILURES = 5

export async function recordAttempt(email: string, ipHash: string | null, success: boolean): Promise<void> {
  try {
    await setupUserTables()
    await sql`
      INSERT INTO auth_attempts (email, ip_hash, success)
      VALUES (${email}, ${ipHash}, ${success})
    `
  } catch (err) {
    console.error('[users] recordAttempt failed:', err)
  }
}

/**
 * Block when either this email or this IP has produced too many failures in the
 * window. Checking both stops one attacker banging on a single account AND one
 * host spraying many accounts.
 *
 * Fails OPEN on a database error: a rate-limit lookup outage must never lock
 * every legitimate user out of their own account.
 */
export async function isRateLimited(email: string, ipHash: string | null): Promise<boolean> {
  try {
    await setupUserTables()
    const rows = await sql`
      SELECT COUNT(*)::int AS failures
      FROM auth_attempts
      WHERE success = FALSE
        AND attempted_at > NOW() - (${ATTEMPT_WINDOW_MIN}::int * INTERVAL '1 minute')
        AND (email = ${email} OR (${ipHash}::text IS NOT NULL AND ip_hash = ${ipHash}::text))
    `
    return ((rows[0]?.failures as number) ?? 0) >= MAX_FAILURES
  } catch (err) {
    console.error('[users] isRateLimited failed (allowing the attempt):', err)
    return false
  }
}

/** Client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

// ── Entitlements ────────────────────────────────────────────────────────────
export interface GrantOptions {
  /** nowpayments | lemon_squeezy | paddle | manual … */
  source: string
  /** null/undefined = open-ended (lifetime or manually managed). */
  days?: number | null
  /** Processor-side id; makes the grant idempotent when a webhook is retried. */
  externalId?: string | null
}

export async function grantEntitlement(userId: number, opts: GrantOptions): Promise<void> {
  await setupUserTables()
  const days = opts.days ?? null
  const externalId = opts.externalId ?? null
  await sql`
    INSERT INTO entitlements (user_id, source, status, external_id, expires_at)
    VALUES (
      ${userId}, ${opts.source}, 'active', ${externalId},
      CASE WHEN ${days}::int IS NULL THEN NULL ELSE NOW() + (${days}::int * INTERVAL '1 day') END
    )
    ON CONFLICT ON CONSTRAINT entitlements_external_uniq DO UPDATE SET
      user_id    = EXCLUDED.user_id,
      status     = 'active',
      expires_at = EXCLUDED.expires_at
  `
}

/** Revoke by processor id (refund, chargeback, cancellation). */
export async function revokeEntitlement(source: string, externalId: string): Promise<void> {
  await setupUserTables()
  await sql`
    UPDATE entitlements SET status = 'revoked'
    WHERE source = ${source} AND external_id = ${externalId}
  `
}

// ── Signup offer ────────────────────────────────────────────────────────────
/**
 * Days of member access granted automatically at signup. 0 disables the offer.
 *
 * Defaults to OFF, and that default is the point. This is the only thing in the
 * module that hands out paid access without a payment or a human deciding to, so
 * it must not switch itself on: a deploy that silently started giving away a
 * month would be discovered from the members table, weeks later, with no record
 * of why. Turning it on is one env var, deliberately.
 *
 * It is NOT a discount on a purchase — nothing here changes what a plan costs.
 * PLANS in lib/premium.ts is the only thing that prices anything, and it is flat.
 * This is a free trial of the member tier, which is the mechanism the site
 * actually has; a true percentage-off would need a coupon concept that does not
 * exist yet.
 */
export const SIGNUP_OFFER_DAYS = Number(process.env.SIGNUP_OFFER_DAYS ?? 0)

/**
 * Grant the signup offer to a brand-new account. Returns the days granted, or
 * null when the offer is off.
 *
 * Idempotent per user via `externalId: signup:<id>`, which hits the
 * entitlements_external_uniq constraint. A retried request therefore re-asserts
 * the same access rather than stacking a second month — the same DO UPDATE
 * behaviour grantEntitlement already relies on for processor retries.
 *
 * Never throws: it runs inside signup, and failing to give away free access must
 * never be the reason someone cannot create an account.
 */
export async function grantSignupOffer(userId: number): Promise<number | null> {
  if (!(SIGNUP_OFFER_DAYS > 0)) return null
  try {
    await grantEntitlement(userId, {
      source: 'signup-offer',
      externalId: `signup:${userId}`,
      days: SIGNUP_OFFER_DAYS,
    })
    return SIGNUP_OFFER_DAYS
  } catch (err) {
    console.error('[users] grantSignupOffer failed:', err)
    return null
  }
}

// ── Referral rewards ────────────────────────────────────────────────────────
/**
 * /account has told members "when someone you refer becomes a member, you get a
 * free month" since the referral section shipped — but nothing ever granted it.
 * `referred_by` was captured at signup and then never read again, so the promise
 * was live, public and unfulfilled. These functions are the missing half.
 *
 * Two properties matter more than the feature itself:
 *
 *   1. IDEMPOTENT, and idempotent the OTHER way from grantEntitlement.
 *      grantEntitlement uses ON CONFLICT DO UPDATE because a processor retry
 *      should re-assert the same access. A referral reward must NOT work that way:
 *      a webhook retried three times, or a referee who buys a second month, must
 *      never pay the referrer twice. So this is DO NOTHING, keyed on the REFEREE
 *      (`referee:<id>`) rather than the order — one reward per referee, ever.
 *
 *   2. IT STACKS, rather than running concurrently.
 *      A reward inserted with `NOW() + 30 days` would be swallowed for any member
 *      who is already paid: getAccount() derives access from MAX(expires_at), so a
 *      referral month that expires before their existing paid period changes
 *      nothing. The expiry is therefore placed at the END of whatever they already
 *      have — `GREATEST(NOW(), MAX(active expires_at)) + 30 days` — which is what
 *      "a free month added to your account" actually means to a paying member.
 */
export const REFERRAL_REWARD_DAYS = 30

/** Resolve a share code to its owner. Codes are stored lowercase by createUser. */
export async function findUserByReferralCode(code: string): Promise<User | null> {
  const clean = (code ?? '').trim().toLowerCase()
  if (!clean) return null
  await setupUserTables()
  const rows = await sql`
    SELECT id, email, referral_code, referred_by, created_at, last_login_at
    FROM users WHERE referral_code = ${clean} LIMIT 1
  `
  return (rows[0] as unknown as User) ?? null
}

export interface ReferralRewardResult {
  granted: boolean
  referrerId?: number
  days?: number
  /** Machine-readable reason when nothing was granted. */
  reason?: 'no-such-user' | 'not-referred' | 'unknown-code' | 'self-referral' | 'already-rewarded' | 'error'
}

/**
 * Reward the referrer of `refereeUserId`. Called when the referee's payment
 * converts — not at signup, because a free account is not a conversion and
 * rewarding signups is how referral schemes get farmed.
 *
 * Never throws: it is called from a payment webhook whose job is to grant the
 * BUYER access. A referral-side failure must not fail that grant or cause the
 * processor to retry the whole block.
 */
export async function grantReferralReward(
  refereeUserId: number,
  days: number = REFERRAL_REWARD_DAYS,
): Promise<ReferralRewardResult> {
  try {
    await setupUserTables()
    const refRows = (await sql`
      SELECT referred_by FROM users WHERE id = ${refereeUserId} LIMIT 1
    `) as unknown as { referred_by: string | null }[]
    const code = refRows[0]?.referred_by
    if (!refRows.length) return { granted: false, reason: 'no-such-user' }
    if (!code) return { granted: false, reason: 'not-referred' }

    const referrer = await findUserByReferralCode(code)
    if (!referrer) return { granted: false, reason: 'unknown-code' }
    if (Number(referrer.id) === Number(refereeUserId)) return { granted: false, reason: 'self-referral' }

    const inserted = (await sql`
      INSERT INTO entitlements (user_id, source, status, external_id, expires_at)
      VALUES (
        ${referrer.id}, 'referral', 'active', ${`referee:${refereeUserId}`},
        GREATEST(
          NOW(),
          COALESCE(
            (SELECT MAX(expires_at) FROM entitlements
             WHERE user_id = ${referrer.id} AND status = 'active'),
            NOW()
          )
        ) + (${days}::int * INTERVAL '1 day')
      )
      ON CONFLICT ON CONSTRAINT entitlements_external_uniq DO NOTHING
      RETURNING id
    `) as unknown as { id: number }[]

    if (!inserted.length) return { granted: false, referrerId: Number(referrer.id), reason: 'already-rewarded' }
    return { granted: true, referrerId: Number(referrer.id), days }
  } catch (err) {
    console.error('[users] grantReferralReward failed:', err)
    return { granted: false, reason: 'error' }
  }
}

export interface ReferralStats {
  /** People who signed up with this user's code. */
  referred: number
  /** Of those, how many have converted to a paying member. */
  conversions: number
  /** Free days earned so far — what /account promises, made visible. */
  daysEarned: number
}

/** Referral activity for the /account panel. Degrades to zeros, never throws. */
export async function getReferralStats(userId: number, myCode: string): Promise<ReferralStats> {
  const empty: ReferralStats = { referred: 0, conversions: 0, daysEarned: 0 }
  try {
    await setupUserTables()
    const code = (myCode ?? '').trim().toLowerCase()
    if (!code) return empty
    const [row] = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE referred_by = ${code}) AS referred,
        (SELECT COUNT(*)::int FROM entitlements
          WHERE user_id = ${userId} AND source = 'referral' AND status = 'active') AS conversions
    `) as unknown as { referred: number; conversions: number }[]
    const conversions = row?.conversions ?? 0
    return {
      referred: row?.referred ?? 0,
      conversions,
      daysEarned: conversions * REFERRAL_REWARD_DAYS,
    }
  } catch (err) {
    console.error('[users] getReferralStats failed:', err)
    return empty
  }
}

// ── Admin: member list ──────────────────────────────────────────────────────
export interface MemberRow {
  id: number
  email: string
  referral_code: string
  referred_by: string | null
  created_at: string
  last_login_at: string | null
  tier: Tier
  paid_until: string | null
  /** Which integration granted the live entitlement — 'nowpayments', 'manual', 'referral'. */
  grant_source: string | null
  /** The matching external id — together with grant_source this is what revokeEntitlement needs. */
  grant_external_id: string | null
  /** Converted orders for this account, excluding the abandoned/crawl junk. */
  paid_orders: number
  last_plan: string | null
}

export interface MemberSummary {
  total: number
  paid: number
  free: number
  signups7d: number
  signups30d: number
  expiring30d: number
  /** Orders that actually converted, across all plans. */
  paidOrders: number
  /** Orders that never converted — mostly the crawl junk from the old GET bug. */
  pendingOrders: number
  /**
   * Of pendingOrders, those WITH an account attached. Those are real abandoned
   * checkouts by a signed-in person — the opposite of noise — so they are the
   * only pending rows worth showing an operator by default.
   */
  pendingAttributed: number
}

/**
 * Every account, newest first, with the tier derived the SAME way getAccount
 * derives it (EXISTS over active, unexpired entitlements).
 *
 * WHY THIS EXISTS
 * Until now there was no query in this module that could return more than one
 * user — every lookup was `WHERE email = …` or `WHERE id = …` — and the only
 * admin affordance was /api/admin/entitlements, which takes a single email and,
 * it turned out, had no UI calling it at all. So "who signed up?" and "did anyone
 * buy?" were answerable only by hand-written SQL.
 *
 * Two deliberate choices:
 *   - MAX(expires_at) over ACTIVE entitlements, mirroring getAccount. A lifetime
 *     grant (expires_at IS NULL) therefore shows paid_until = NULL while tier is
 *     'paid' — the same asymmetry /account already displays, kept consistent on
 *     purpose rather than quietly diverging between the two screens.
 *   - Degrades to [] rather than throwing. An admin dashboard that 500s because
 *     one subquery failed is worse than one that renders an empty table.
 */
export async function listMembers(limit = 200, search = ''): Promise<MemberRow[]> {
  try {
    await setupUserTables()
    const term = `%${(search ?? '').trim()}%`
    const rows = (await sql`
      SELECT u.id, u.email, u.referral_code, u.referred_by, u.created_at, u.last_login_at,
             EXISTS (
               SELECT 1 FROM entitlements e
               WHERE e.user_id = u.id AND e.status = 'active'
                 AND (e.expires_at IS NULL OR e.expires_at > NOW())
             ) AS is_paid,
             (SELECT MAX(e.expires_at) FROM entitlements e
               WHERE e.user_id = u.id AND e.status = 'active') AS paid_until,
             (SELECT e.source FROM entitlements e
               WHERE e.user_id = u.id AND e.status = 'active'
               ORDER BY e.granted_at DESC LIMIT 1) AS grant_source,
             (SELECT e.external_id FROM entitlements e
               WHERE e.user_id = u.id AND e.status = 'active'
               ORDER BY e.granted_at DESC LIMIT 1) AS grant_external_id,
             (SELECT COUNT(*)::int FROM subscribers s
               WHERE s.user_id = u.id AND s.status IN ('paid', 'active')) AS paid_orders,
             (SELECT s.plan FROM subscribers s
               WHERE s.user_id = u.id AND s.status IN ('paid', 'active')
               ORDER BY s.paid_at DESC NULLS LAST LIMIT 1) AS last_plan
      FROM users u
      WHERE (${search ?? ''} = '' OR u.email ILIKE ${term})
      ORDER BY u.created_at DESC
      LIMIT ${limit}
    `) as unknown as Array<Record<string, unknown>>

    return rows.map((r) => {
      const { is_paid, ...rest } = r
      return {
        ...(rest as unknown as Omit<MemberRow, 'tier'>),
        tier: is_paid ? 'paid' : 'free',
      }
    })
  } catch (err) {
    console.error('[users] listMembers failed:', err)
    return []
  }
}

/**
 * Headline counts for the members dashboard. Zeros on failure, never throws.
 *
 * NOTE the quoted camelCase aliases. Postgres folds unquoted identifiers to
 * lower case, so `AS paidOrders` arrives as `paidorders`, the property lookup
 * misses, and `?? 0` renders a confident, wrong zero. That is the exact
 * silent-zero failure this dashboard was built to remove, so it is worth the
 * two sets of quotes. (The camelCase-free aliases — total, paid, signups7d —
 * need no quoting and are left bare.)
 */
export async function getMemberSummary(): Promise<MemberSummary> {
  const empty: MemberSummary = {
    total: 0, paid: 0, free: 0, signups7d: 0, signups30d: 0, expiring30d: 0, paidOrders: 0, pendingOrders: 0, pendingAttributed: 0,
  }
  try {
    await setupUserTables()
    const [row] = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total,
        (SELECT COUNT(*)::int FROM users u WHERE EXISTS (
           SELECT 1 FROM entitlements e
           WHERE e.user_id = u.id AND e.status = 'active'
             AND (e.expires_at IS NULL OR e.expires_at > NOW())
        )) AS paid,
        (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days')  AS signups7d,
        (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '30 days') AS signups30d,
        (SELECT COUNT(*)::int FROM entitlements
           WHERE status = 'active' AND expires_at IS NOT NULL
             AND expires_at > NOW() AND expires_at < NOW() + INTERVAL '30 days') AS expiring30d,
        (SELECT COUNT(*)::int FROM subscribers WHERE status IN ('paid', 'active')) AS "paidOrders",
        (SELECT COUNT(*)::int FROM subscribers WHERE status = 'pending')          AS "pendingOrders",
        (SELECT COUNT(*)::int FROM subscribers
           WHERE status = 'pending' AND user_id IS NOT NULL)                      AS "pendingAttributed"
    `) as unknown as Array<Record<string, number>>

    const total = row?.total ?? 0
    const paid = row?.paid ?? 0
    return {
      total, paid, free: total - paid,
      signups7d: row?.signups7d ?? 0,
      signups30d: row?.signups30d ?? 0,
      expiring30d: row?.expiring30d ?? 0,
      paidOrders: row?.paidOrders ?? 0,
      pendingOrders: row?.pendingOrders ?? 0,
      pendingAttributed: row?.pendingAttributed ?? 0,
    }
  } catch (err) {
    console.error('[users] getMemberSummary failed:', err)
    return empty
  }
}