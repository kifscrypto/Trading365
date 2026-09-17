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
  await sql`CREATE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions (token_hash)`
  await sql`CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions (expires_at)`
  await sql`CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id)`
  await sql`CREATE INDEX IF NOT EXISTS auth_attempts_recent_idx ON auth_attempts (email, attempted_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON auth_attempts (ip_hash, attempted_at DESC)`
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