import { NextResponse } from 'next/server'
import { RESET_TTL_MINUTES, normaliseEmail, requestPasswordReset, validEmail } from '@/lib/users'
import { SITE_URL, emailConfigured, passwordResetEmail, sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/reset-request  { email }
 *
 * Starts a password reset. Always answers with the same shape for a known address,
 * an unknown one, and a request suppressed by the cooldown, so the response cannot
 * be used to discover which emails are registered.
 *
 * TIMING is the one thing this does not equalise: a known address awaits a
 * provider round-trip before replying and an unknown one returns immediately. That
 * is a pre-existing trade-off rather than a new hole — POST /api/auth/signup
 * already says "That email is already registered" in as many words, deliberately,
 * so enumeration was already possible and this adds nothing. If that is ever
 * closed, the signup route is where to start, not here.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = normaliseEmail(String(body?.email ?? ''))

    if (!validEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    // No provider means no link can arrive. Saying "check your inbox" here would be
    // a lie the user acts on — they would wait for an email that was never sent.
    if (!emailConfigured()) {
      return NextResponse.json(
        { error: 'Password resets are not available right now. Please contact support.' },
        { status: 503 },
      )
    }

    const result = await requestPasswordReset(email)

    if (result.created && result.token) {
      const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(result.token)}`
      const sent = await sendEmail(
        passwordResetEmail({ email, resetUrl, expiresMinutes: RESET_TTL_MINUTES }),
      )
      // The token exists but could not be delivered. Logged loudly because the
      // user is about to be told to check an inbox that will stay empty.
      if (!sent.ok) {
        console.error(`[auth/reset-request] link created but send failed (${sent.status}) for ${email}`)
      }
    } else if (result.reason === 'cooldown') {
      console.log(`[auth/reset-request] suppressed by cooldown for ${email}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[auth/reset-request]', error)
    return NextResponse.json({ error: 'Could not start the reset. Please try again.' }, { status: 500 })
  }
}
