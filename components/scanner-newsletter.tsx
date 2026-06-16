"use client"

import { Mail, CheckCircle, Loader2 } from "lucide-react"
import { useState } from "react"

const ACCENTS = {
  red: {
    text: "text-primary",
    soft: "bg-primary/10",
    btn: "bg-primary hover:bg-primary/90 text-primary-foreground",
    ring: "focus:ring-primary/50",
  },
  emerald: {
    text: "text-emerald-400",
    soft: "bg-emerald-500/10",
    btn: "bg-emerald-500 hover:bg-emerald-400 text-zinc-950",
    ring: "focus:ring-emerald-500/40",
  },
} as const

export function ScannerNewsletter({
  accent = "red",
  utmCampaign,
}: {
  accent?: "red" | "emerald"
  utmCampaign?: string
}) {
  const a = ACCENTS[accent]
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus("loading")
    setErrorMsg("")
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, utm_source: "scanner", utm_medium: "website", utm_campaign: utmCampaign }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong — please try again.")
        setStatus("error")
        return
      }
      setStatus("success")
      setEmail("")
    } catch {
      setErrorMsg("Something went wrong — please try again.")
      setStatus("error")
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <div className="rounded-xl border border-border bg-zinc-900 p-6 sm:p-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg ${a.soft}`}>
            <Mail className={`h-5 w-5 ${a.text}`} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Free signals to your inbox</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The week&apos;s top-rated setups, the current BTC regime call, and a performance recap — straight to your inbox. No spam, unsubscribe anytime.
          </p>

          {status === "success" ? (
            <div className="mt-6 flex flex-col items-center gap-2">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
              <p className="text-sm font-medium text-foreground">You&apos;re in — check your inbox to confirm.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={status === "loading"}
                className={`h-11 flex-1 max-w-xs rounded-lg border border-border bg-zinc-950 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${a.ring} disabled:opacity-60`}
              />
              <button
                type="submit"
                disabled={status === "loading" || !email}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold transition-colors disabled:opacity-60 ${a.btn}`}
              >
                {status === "loading" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Subscribing…</>
                ) : (
                  "Get free signals"
                )}
              </button>
            </form>
          )}

          {status === "error" && <p className="mt-3 text-xs text-red-400">{errorMsg}</p>}

          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Free forever. Upgrade anytime — one subscription covers both scanners.
          </p>
        </div>
      </div>
    </section>
  )
}
