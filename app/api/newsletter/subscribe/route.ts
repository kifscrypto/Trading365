import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { email, utm_source, utm_medium, utm_campaign } = await req.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const apiKey = process.env.BEEHIIV_API_KEY
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID

  if (!apiKey || !publicationId) {
    return NextResponse.json({ error: "Newsletter not configured" }, { status: 500 })
  }

  const res = await fetch(
    `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: utm_source ?? "trading365-website",
        utm_medium: utm_medium ?? "organic",
        ...(utm_campaign ? { utm_campaign } : {}),
      }),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    console.error("Beehiiv error:", data)
    return NextResponse.json({ error: "Subscription failed — please try again" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
