import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const isAuth = !!cookieStore.get('admin_auth')
    
    if (!isAuth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    return NextResponse.json({ authenticated: true })
  } catch (error) {
    return NextResponse.json({ error: 'Session check failed' }, { status: 500 })
  }
}
