import type { Metadata } from "next"
import { IBM_Plex_Mono, Saira, Saira_Condensed } from "next/font/google"
import "../live/live.css"
import "./arcade.css"

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--mono" })
const sans = Saira({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--sans" })
const cond = Saira_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--cond" })

// Belt-and-braces with the middleware's X-Robots-Tag header.
export const metadata: Metadata = {
  title: "Live Arcade",
  robots: { index: false, follow: false, nocache: true },
}

export default function LiveArcadeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${mono.variable} ${sans.variable} ${cond.variable}`}>{children}</div>
}
