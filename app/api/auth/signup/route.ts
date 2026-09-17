import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createSession, createUser, clientIp, hashIp, isRateLimited, markLogin, normaliseEmail,
  passwordProblem, recordAttempt, sessionCookie, validEmail,
} from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an account.
 *
 * Signup does NOT grant access on its own — a new account is the free tier.
 * Paid access comes from an entitlement, written by a payment webhook (or a
 * manual grant), so nothing here needs to know about a processor.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request))
  try {
    const body = await request.json().catch(() => ({}))
    const email = normaliseEmail(String(body?.email ?? ''))
    const password = String(body?.password ?? '')
    const ref = typeof body?.ref === 'string' ? body.ref : null

    if (!validEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    const pwProblem = passwordProblem(password)
    if (pwProblem) {
      return NextResponse.json({ error: pwProblem }, { status: 400 })
    }
    // Same limiter as sign-in: without it, signup is a free account-creation
    // oracle for enumerating which emails are already registered.
    if (await isRateLimited(email, ipHash)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
    }

    const created = await createUser(email, password, ref)
    if ('error' in created) {
      await recordAttempt(email, ipHash, false)
      // Deliberately explicit rather than vague: this endpoint is also the
      // normal "I already have an account" path, and a generic error would send
      // those users in circles. It does confirm an address is registered — an
      // accepted trade-off for a free tier with no email verification.
      return NextResponse.json({ error: 'That email is already registered. Try signing in.' }, { status: 409 })
    }

    const { token, maxAge } = await createSession(created.user.id, request.headers.get('user-agent'))
    const cookieStore = await cookies()
    cookieStore.set(sessionCookie(token, maxAge))
    await markLogin(created.user.id)
    await recordAttempt(email, ipHash, true)

    return NextResponse.json({ success: true, referralCode: created.user.referral_code })
  } catch (error) {
    console.error('[auth/signup]', error)
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }
}