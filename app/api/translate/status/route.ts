import { getTranslationLocalesBySlug } from "@/lib/db"
import { verifyAdmin } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const data = await getTranslationLocalesBySlug()
    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
