import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createSession, createUser, clientIp, grantSignupOffer, hashIp, isRateLimited, markLogin,
  normaliseEmail, passwordProblem, recordAttempt, sessionCookie, validEmail,
} from '@/lib/users'
import { emailConfigured, sendEmail, welcomeEmail } from '@/lib/email'
import { FREE_TIER_DELAY_HOURS } from '@/lib/signals/public'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an account.
 *
 * Signup does NOT grant access on its own — a new account is the free tier.
 * Paid access comes from an entitlement, written by a payment webhook (or a
 * manual grant), so nothing here needs to know about a processor.
 *
 * The one exception is the optional signup offer (SIGNUP_OFFER_DAYS, off by
 * default), which grants a trial through the same grantEntitlement() path every
 * other grant uses rather than a second mechanism.
 *
 * A welcome email goes out on success. It is AWAITED, not fired and forgotten:
 * a serverless function can be frozen the moment the response is sent, so work
 * left running behind the response is work that may simply never happen. The cost
 * is one provider round-trip added to signup, which is the right trade against
 * silently not sending the first email a member would ever receive.
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

    // The optional signup offer. Returns null when SIGNUP_OFFER_DAYS is unset, so
    // this is inert by default. Deliberately AFTER the session exists: if granting
    // throws, the account still works and the member is simply on the free tier.
    const offerDays = await grantSignupOffer(created.user.id)

    if (emailConfigured()) {
      const sent = await sendEmail(
        welcomeEmail({
          email,
          referralCode: created.user.referral_code,
          delayHours: FREE_TIER_DELAY_HOURS,
          offerDays,
        }),
      )
      // Logged, not surfaced. The account was created and the session is set; an
      // email failure must not turn a successful signup into an error screen.
      if (!sent.ok) {
        console.error(`[auth/signup] welcome email not sent (${sent.status}) to ${email}`)
      }
    }

    return NextResponse.json({ success: true, referralCode: created.user.referral_code })
  } catch (error) {
    console.error('[auth/signup]', error)
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }
}