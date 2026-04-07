"use client"

import { Mail, CheckCircle, Loader2 } from "lucide-react"
import { useState } from "react"

export function NewsletterCta() {
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
        body: JSON.stringify({ email }),
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
    <section id="newsletter" className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 md:p-12">
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground text-balance">
            Stay Ahead of the Market
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Get exclusive exchange deals, in-depth reviews, and market insights delivered to your inbox. No spam, unsubscribe anytime.
          </p>

          {status === "success" ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">You&apos;re in! Check your inbox to confirm.</p>
              <p className="text-xs text-muted-foreground">Welcome to the Trading365 newsletter.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                disabled={status === "loading"}
                className="h-11 flex-1 max-w-xs rounded-lg border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === "loading" || !email}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Subscribing...</>
                ) : (
                  "Subscribe Free"
                )}
              </button>
            </form>
          )}

          {status === "error" && (
            <p className="mt-3 text-xs text-red-400">{errorMsg}</p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Join thousands of traders. Free forever.
          </p>
        </div>
      </div>
    </section>
  )
}
