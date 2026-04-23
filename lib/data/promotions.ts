import { sql } from '@/lib/db'

export interface Promotion {
  id: number
  name: string
  image_url: string
  destination_url: string
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export async function ensurePromotionsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS promotions (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      image_url       TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      active          BOOLEAN DEFAULT TRUE,
      display_order   INTEGER DEFAULT 0,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW()
    )
  `
}

export async function getActivePromotions(): Promise<Promotion[]> {
  await ensurePromotionsTable()
  const rows = await sql`
    SELECT * FROM promotions
    WHERE active = TRUE
    ORDER BY display_order ASC, created_at DESC
  `
  return rows as Promotion[]
}

export async function getAllPromotions(): Promise<Promotion[]> {
  await ensurePromotionsTable()
  const rows = await sql`
    SELECT * FROM promotions
    ORDER BY display_order ASC, created_at DESC
  `
  return rows as Promotion[]
}
