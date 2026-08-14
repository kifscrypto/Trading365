import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { mintAdminToken, SESSION_TTL } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    // Fail closed: never fall back to a hardcoded password in any environment.
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD env var is not set — refusing admin login')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    if (password === adminPassword) {
      const cookieStore = await cookies()
      cookieStore.set('admin_auth', await mintAdminToken(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL,
      })

      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
