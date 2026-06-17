import type { Metadata } from "next"
import { LiveScene } from "./live-scene"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

// Token gating is enforced in middleware.ts (404 without the correct ?k=).
// This page only renders the scene; the client carries the page's own token
// when polling /api/live.
export default function LivePage() {
  return <LiveScene />
}
