'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'

const STORAGE_KEY = 't365_popup_dismissed'
const DISMISS_DAYS = 14
const TRIGGER_DELAY_MS = 20_000

export function ExitIntentPopup() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const readyRef = useRef(false)

  const blockedRoutes = ['/admin', '/studio', '/api']
  const isBlocked = blockedRoutes.some(r => pathname.startsWith(r))

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isBlocked) return

    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) {
      const ts = parseInt(dismissed, 10)
      const expiry = ts + DISMISS_DAYS * 24 * 60 * 60 * 1000
      if (Date.now() < expiry) return
    }

    const timer = setTimeout(() => {
      readyRef.current = true
    }, TRIGGER_DELAY_MS)

    const handleMouseLeave = (e: MouseEvent) => {
      if (readyRef.current && e.clientY <= 0) {
        setVisible(true)
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [mounted, isBlocked, pathname])

  if (!mounted || isBlocked) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    setVisible(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')
      setSuccess(true)
      setTimeout(dismiss, 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-xl bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
        >
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative w-full max-w-lg bg-slate-950 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden"
          >
            {/* Top accent bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500" />

            <div className="p-8">
              {/* Close button */}
              <button
                onClick={dismiss}
                aria-label="Close"
                className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-xl font-light"
              >
                ×
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    LIVE UPDATE
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">
                  The 2026 Exchange Bonus<br />
                  <span className="text-cyan-400">Master List</span>
                </h2>
                <p className="mt-3 text-slate-400 text-sm leading-relaxed">
                  We track 50+ exchanges daily. Join 12,000+ traders receiving our weekly breakdown of the highest-paying sign-up bonuses and hidden referral perks.
                </p>
              </div>

              {/* Checklist */}
              <ul className="mb-6 space-y-2">
                {['Weekly Bonus Updates', 'No-KYC Exchange Alerts', 'Exclusive T365 Referral Codes'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xs">✓</span>
                    {item}
                  </li>
                ))}
              </ul>

              {/* Form / Success */}
              {success ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
                >
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="text-emerald-400 font-semibold text-sm">You&apos;re on the list!</p>
                    <p className="text-slate-400 text-xs mt-0.5">Check your inbox for the Master List!</p>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
                  />
                  {error && <p className="text-red-400 text-xs px-1">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                        Joining...
                      </>
                    ) : 'Join the Pro List'}
                  </button>
                </form>
              )}

              <p className="mt-4 text-center text-slate-600 text-xs">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
