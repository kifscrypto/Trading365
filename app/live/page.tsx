import type { Metadata } from "next"
import { LiveScene } from "./live-scene"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

// /live is public (see middleware.ts). It renders the scanner scene plus a
// fixed "back to site" link so visitors who land here aren't stranded on the
// full-bleed broadcast canvas with no way into the rest of the site. The link is
// position:fixed above the scene overlay (which sits at z-index 2147483000).
export default function LivePage() {
  return (
    <>
      {/* Desktop: floating link back into the site over the scene. */}
      <a href="/" aria-label="Back to Trading365" className="live-backlink">
        ← Back to Trading365
      </a>

      {/* Mobile soft-landing: the 1920×1080 scanner canvas is unreadable scaled
          to a phone, so small screens get a clean intro + links instead and the
          scene is hidden (see live.css @media). */}
      <div className="live-mobile">
        <h1>Trading365 Live Scanner</h1>
        <p>
          Real-time long &amp; short crypto signals with live win-rate and P&amp;L.
          Best viewed on a larger screen.
        </p>
        <div className="btns">
          <a href="/scanner" className="btn primary">Explore the scanner →</a>
          <a href="/" className="btn secondary">Back to Trading365</a>
        </div>
      </div>

      <LiveScene />
    </>
  )
}
