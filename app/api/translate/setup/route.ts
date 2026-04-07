import { createTranslationsTable } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    await createTranslationsTable()
    return NextResponse.json({ success: true, message: "article_translations table created" })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
