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
      <a
        href="/"
        aria-label="Back to Trading365"
        style={{
          position: "fixed",
          top: "12px",
          left: "12px",
          zIndex: 2147483647,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 14px",
          borderRadius: "9999px",
          background: "rgba(10,10,10,0.9)",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.18)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          lineHeight: 1,
          textDecoration: "none",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        ← Back to Trading365
      </a>
      <LiveScene />
    </>
  )
}
