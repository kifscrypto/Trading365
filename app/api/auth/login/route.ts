import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import {
  clientIp, createSession, findUserByEmail, hashIp, hashPassword, isRateLimited,
  markLogin, normaliseEmail, recordAttempt, sessionCookie, verifyPassword,
} from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A hash of a random string, computed once per process. Compared against when
 * the email is unknown so that a missing account costs the same as a wrong
 * password — otherwise response latency becomes an account-existence oracle.
 */
let dummyHash: string | null = null

export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request))
  try {
    const body = await request.json().catch(() => ({}))
    const email = normaliseEmail(String(body?.email ?? ''))
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (await isRateLimited(email, ipHash)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again in 15 minutes.' },
        { status: 429 },
      )
    }

    const user = await findUserByEmail(email)
    dummyHash ??= await hashPassword(randomBytes(16).toString('hex'))
    const ok = await verifyPassword(password, user ? user.password_hash : dummyHash)

    if (!user || !ok) {
      await recordAttempt(email, ipHash, false)
      // One message for both cases: never reveal whether the email exists.
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 })
    }

    const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent'))
    const cookieStore = await cookies()
    cookieStore.set(sessionCookie(token, maxAge))
    await markLogin(user.id)
    await recordAttempt(email, ipHash, true)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[auth/login]', error)
    return NextResponse.json({ error: 'Could not sign you in. Please try again.' }, { status: 500 })
  }
}