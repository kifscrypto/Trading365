import { NextResponse } from 'next/server'
import { SESSION_COOKIE, SIGNED_IN_COOKIE, destroySession } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sign out. POST only (a GET link would let any image tag or prefetch log a user
 * out), and it both deletes the server-side session row and expires the cookie
 * on the response — clearing only the cookie would leave a valid session alive.
 *
 * It also clears the client-readable companion flag. Missing that would leave the
 * header offering "My account" to someone who has just signed out — and the flag
 * cannot expire on its own any sooner than the session did, which is 30 days.
 */
export async function POST(request: Request) {
  await destroySession(request)
  const res = NextResponse.redirect(new URL('/', request.url), 303)
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  res.cookies.set({
    name: SIGNED_IN_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  return res
}