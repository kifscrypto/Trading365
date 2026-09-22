import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { consumePasswordReset, createSession, markLogin, sessionCookie } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/reset-confirm  { token, password }
 *
 * Redeems a reset link and sets the new password. On success the user is signed in
 * here rather than bounced to /login: they have just proved control of the mailbox
 * and chosen a password, so asking them to type it again immediately is friction
 * with nothing behind it.
 *
 * The failure messages are specific on purpose. "This link has expired" and "this
 * link has already been used" lead to different actions — request a new one, or
 * sign in with the password just set — and a generic error would send the second
 * case round the loop again.
 */
const MESSAGES: Record<string, string> = {
  'weak-password': 'Password must be at least 8 characters.',
  invalid: 'That reset link is not valid. Request a new one.',
  expired: 'That reset link has expired. Request a new one.',
  used: 'That reset link has already been used. If you just changed your password, sign in with it.',
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = String(body?.token ?? '')
    const password = String(body?.password ?? '')

    if (!token) {
      return NextResponse.json({ error: MESSAGES.invalid }, { status: 400 })
    }

    const outcome = await consumePasswordReset(token, password)

    if (outcome.status !== 'ok' || !outcome.userId) {
      const status = outcome.status === 'weak-password' ? 400 : 410
      return NextResponse.json({ error: MESSAGES[outcome.status] ?? MESSAGES.invalid }, { status })
    }

    const { token: sessionToken, maxAge } = await createSession(
      outcome.userId,
      request.headers.get('user-agent'),
    )
    const cookieStore = await cookies()
    cookieStore.set(sessionCookie(sessionToken, maxAge))
    await markLogin(outcome.userId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[auth/reset-confirm]', error)
    return NextResponse.json({ error: 'Could not reset your password. Please try again.' }, { status: 500 })
  }
}
