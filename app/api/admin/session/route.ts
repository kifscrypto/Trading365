import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_auth')
  return NextResponse.json({ success: true })
}
