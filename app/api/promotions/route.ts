import { NextResponse } from 'next/server'
import { getActivePromotions } from '@/lib/data/promotions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const promotions = await getActivePromotions()
    return NextResponse.json(promotions)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
