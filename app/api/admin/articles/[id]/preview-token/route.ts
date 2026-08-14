import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { regeneratePreviewToken } from '@/lib/db'

function checkAuth(request: Request) {
  return verifyAdmin(request)
}

// Rotate an article's preview token, invalidating any previously shared link.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(request))) {
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
