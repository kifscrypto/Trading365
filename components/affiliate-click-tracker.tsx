"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { exchangeFromUrl } from "@/lib/affiliate-domains"

const LOCALES = ["zh-CN", "zh-TW", "ja", "ko", "es", "pt", "de", "fr", "ru"]

// Fire-and-forget logging of outbound affiliate-link clicks. A single capture-phase
// listener on the document catches clicks anywhere (including the article body, which
// is rendered via dangerouslySetInnerHTML and so isn't React-controlled). Links stay
// pointed directly at the merchant — we only observe the click, never redirect it.
export function AffiliateClickTracker() {
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.href // absolute, resolved by the browser
      const exchange = exchangeFromUrl(href)
      if (!exchange) return

      const path = pathRef.current || "/"
      const segs = path.split("/").filter(Boolean)
      const locale = LOCALES.includes(segs[0]) ? segs[0] : "en"
      const slug = segs.length ? segs[segs.length - 1] : ""

      let session_id: string | null = null
      try {
        session_id = localStorage.getItem("t365_sid")
      } catch {
        // localStorage may be unavailable (privacy mode) — session id is optional
      }

      const payload = JSON.stringify({ url: href, exchange, path, article_slug: slug, locale, session_id })
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/track/click", new Blob([payload], { type: "application/json" }))
        } else {
          fetch("/api/track/click", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {})
        }
      } catch {
        // never let click tracking interfere with the navigation
      }
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}
