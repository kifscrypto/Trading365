import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { regeneratePreviewToken } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

// Rotate an article's preview token, invalidating any previously shared link.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await params
    const token = await regeneratePreviewToken(parseInt(id))
    return NextResponse.json({ preview_token: token })
  } catch (error: any) {
    console.error('Failed to regenerate preview token:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }
}
