import { getTranslationLocalesBySlug } from "@/lib/db"

export async function GET() {
  try {
    const data = await getTranslationLocalesBySlug()
    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
