import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete({ name: 'admin_auth', path: '/' })
  return NextResponse.json({ success: true })
}
