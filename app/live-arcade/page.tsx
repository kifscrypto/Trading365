import type { Metadata } from "next"
import { ArcadeScene } from "./arcade-scene"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

// Token gating is enforced in middleware.ts (404 without the correct ?k=).
// Second broadcast surface: the scanner condensed into a left rail beside a large
// game-window placeholder you composite a gameplay capture into (in OBS).
export default function LiveArcadePage() {
  return <ArcadeScene />
}
