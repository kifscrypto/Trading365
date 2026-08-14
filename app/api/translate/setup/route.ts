import { createTranslationsTable } from "@/lib/db"
import { verifyAdmin } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await createTranslationsTable()
    return NextResponse.json({ success: true, message: "article_translations table created" })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
