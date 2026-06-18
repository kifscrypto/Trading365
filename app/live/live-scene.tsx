"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"
import type { Book, LiveData, LivePrice, LiveSideRecord, Verdict } from "@/lib/live-types"

// A book needs at least this many closed signals before we show a hit-rate %.
const MIN_SAMPLE = 20

// Destinations are env-configurable (no hardcoded literals). The website is the
// primary hub; the QR encodes NEXT_PUBLIC_QR_TARGET_URL (defaults to the site).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.trading365.org"
const SUB_URL = process.env.NEXT_PUBLIC_SUB_URL || "https://t.me/trading365Sub"
const QR_URL = process.env.NEXT_PUBLIC_QR_TARGET_URL || SITE_URL
const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")
const SITE_HOST = host(SITE_URL)
const SUB_HANDLE = host(SUB_URL)
const QR_HOST = host(QR_URL)

// Preferred-partner slot in the bottom band. Hard-coded for now — edit `name`
// to swap the sponsor (or clear it to hide the box entirely).
const PARTNER = { name: "WEEX", msg: "Click the link in the description" }

// Rotating strip alternates website-intent and sub lines (URLs from env).
const CTA_MSGS = [
  `Independent exchange reviews, fees &amp; sign-up bonuses → <b>${SITE_HOST}</b>`,
  `Find the right exchange for your strategy → <b>${SITE_HOST}</b>`,
  `Live signal alerts in the premium group → <b>${SUB_HANDLE}</b>`,
  `Long or short, every fire hits the premium group in real time`,
]

// Non-revealing per-verdict presentation. Never states WHY (no gate inputs).
const REG: Record<Verdict, { state: string; head: string; desc: string; c: string }> = {
  long: {
    state: "LONG BOOK · LIVE", head: "LONG SCANNER ENGAGED",
    desc: "Long book engaged. Setups that clear the bar are firing live to members.", c: "#37d98a",
  },
  short: {
    state: "SHORT BOOK · LIVE", head: "SHORT SCANNER ENGAGED",
    desc: "Conditions favour the short book. Setups that clear the bar are firing live to members.", c: "#ff4d5e",
  },
  neutral: {
    state: "STANDING DOWN", head: "SCANNERS HOLDING FIRE",
    desc: "No book engaged — standing down. The scanner stays silent until conditions align.", c: "#ff9d2e",
  },
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad = (n: number) => String(n).padStart(2, "0")

function decPrice(p: number): string {
  if (!Number.isFinite(p)) return "—"
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (p >= 1) return p.toFixed(2)
  return p.toFixed(p < 0.01 ? 5 : 4)
}
function fmtEntry(p: number): string {
  if (!Number.isFinite(p)) return "—"
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toPrecision(4)
}
function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(0, mins)}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
function fmtPct(n: number | null, digits = 0): string {
  return n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`
}
function momentumLevel(p: number | null) { if (p == null) return 0; const a = Math.abs(p); return a < 0.5 ? 1 : a < 1 ? 2 : a < 2 ? 3 : a < 3.5 ? 4 : 5 }
function volLevel(v: number | null) { if (v == null) return 0; return v < 2 ? 1 : v < 3.5 ? 2 : v < 5 ? 3 : v < 7 ? 4 : 5 }
function breadthLevel(b: number | null) { if (b == null) return 0; return Math.max(1, Math.min(5, Math.round(b / 20))) }

// Per-book scoreboard cell: hide the rate until the sample is big enough.
function sideContent(side?: LiveSideRecord) {
  const count = side?.count ?? 0
  if (count < MIN_SAMPLE) return <>building ({count})</>
  return <>{fmtPct(side!.hitRate)} <small>/ {count}</small></>
}

export function LiveScene() {
  const stageRef = useRef<HTMLDivElement>(null)
  const tokenRef = useRef<string | null>(null)
  const prevPrices = useRef<Record<string, number>>({})

  const [data, setData] = useState<LiveData | null>(null)
  const [prices, setPrices] = useState<LivePrice[]>([])
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({})
  const [clock, setClock] = useState("00:00:00")
  const [dateStr, setDateStr] = useState("—")
  const [since, setSince] = useState("—")
  const [nextScan, setNextScan] = useState("--:--")
  const [ctaIdx, setCtaIdx] = useState(0)
  const [feedTried, setFeedTried] = useState(false)

  // Fire-moment state (purely client-side reaction to a newer signal id)
  const [firingId, setFiringId] = useState<number | null>(null)
  const [heldId, setHeldId] = useState<number | null>(null)
  // Transient verdict the regime washes to DURING a fire/replay (the fired
  // signal's side). Cleared on settle → returns to the real verdict.
  const [fireVerdict, setFireVerdict] = useState<Verdict | null>(null)
  // Which book the operator is broadcasting. Default SHORT (long model is
  // freshly rewritten and still building a track record). Filters the feed,
  // closed panel and track record server-side; the regime follows it.
  const [book, setBookState] = useState<Book>("short")
  const bookRef = useRef<Book>("short")
  const seenIdRef = useRef<number | null>(null)
  const firstPollDoneRef = useRef(false)
  const prevVerdictRef = useRef<Verdict | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const fireflashRef = useRef<HTMLDivElement>(null)
  const firebannerRef = useRef<HTMLDivElement>(null)
  const fbTxtRef = useRef<HTMLSpanElement>(null)
  const qrcardRef = useRef<HTMLDivElement>(null)
  const actxRef = useRef<AudioContext | null>(null)
  const reducedRef = useRef(false)
  const dataRef = useRef<LiveData | null>(null) // latest data for event handlers/ticks

  // ── scale-to-fit 1920×1080 ──
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
      if (stageRef.current) stageRef.current.style.transform = `scale(${s})`
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])

  useEffect(() => {
    tokenRef.current = new URLSearchParams(window.location.search).get("k")
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const applyPrices = useCallback((next: LivePrice[]) => {
    if (!next.length) return
    const f: Record<string, "up" | "down"> = {}
    for (const p of next) {
      const prev = prevPrices.current[p.symbol]
      if (prev != null && p.price !== prev) f[p.symbol] = p.price >= prev ? "up" : "down"
      prevPrices.current[p.symbol] = p.price
    }
    setPrices(next)
    setFlash(f)
    window.setTimeout(() => setFlash({}), 260)
  }, [])

  const chime = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const actx = actxRef.current || (actxRef.current = new AC())
      if (actx.state === "suspended") actx.resume().catch(() => {})
      const now = actx.currentTime
      const lp = actx.createBiquadFilter()
      lp.type = "lowpass"; lp.frequency.value = 2200; lp.connect(actx.destination)
      ;([[523.25, 0], [783.99, 0.09]] as const).forEach(([f, t]) => {
        const o = actx.createOscillator(), g = actx.createGain()
        o.type = "triangle"; o.frequency.value = f
        g.gain.setValueAtTime(0, now + t)
        g.gain.linearRampToValueAtTime(0.13, now + t + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0008, now + t + 0.55)
        o.connect(g); g.connect(lp); o.start(now + t); o.stop(now + t + 0.6)
      })
    } catch { /* audio optional */ }
  }, [])

  // Clear any in-flight fire visuals + pending settle. Called when the state
  // moves on without a fresh fire, so one fire never bleeds into a later state.
  const clearFire = useCallback(() => {
    if (settleTimerRef.current) { window.clearTimeout(settleTimerRef.current); settleTimerRef.current = null }
    setFiringId(null); setHeldId(null); setFireVerdict(null)
    fireflashRef.current?.classList.remove("go")
    firebannerRef.current?.classList.remove("go")
    qrcardRef.current?.classList.remove("pulse")
  }, [])

  const triggerFire = useCallback((sig: { id: number; direction: "long" | "short" }) => {
    // Always cancel a prior fire first (timer + classes) so they can't overlap.
    if (settleTimerRef.current) { window.clearTimeout(settleTimerRef.current); settleTimerRef.current = null }
    setHeldId(null)
    setFiringId(sig.id)
    setFireVerdict(sig.direction) // wash the regime to the fired signal's colour

    if (!reducedRef.current) {
      const ff = fireflashRef.current
      if (ff) { ff.classList.remove("go"); void ff.offsetWidth; ff.classList.add("go") }
      const bn = firebannerRef.current
      if (bn && fbTxtRef.current) { fbTxtRef.current.textContent = `⚡ SIGNAL FIRED · ${sig.direction === "long" ? "LONG" : "SHORT"}`; bn.classList.remove("go"); void bn.offsetWidth; bn.classList.add("go") }
      const qc = qrcardRef.current
      if (qc) { qc.classList.remove("pulse"); void qc.offsetWidth; qc.classList.add("pulse") }
      chime()
    }

    // SETTLE after ~12s: the fired row drops to a steady left-accent highlight.
    // Keyed by signal id (the React-safe equivalent of "only that row, if still
    // connected") — if it has scrolled out of the last-10 it simply won't render.
    settleTimerRef.current = window.setTimeout(() => {
      setFiringId(null)
      setHeldId(sig.id)
      setFireVerdict(null) // calm down → back to the real/preview verdict
      fireflashRef.current?.classList.remove("go")
      firebannerRef.current?.classList.remove("go")
      qrcardRef.current?.classList.remove("pulse")
      settleTimerRef.current = null
    }, 12000)
  }, [chime])

  // FIRE A SIGNAL button: replay the REAL most-recent signal's animation.
  // Presentation only — reads live data, writes nothing, sends nothing.
  const fireLatest = useCallback(() => {
    const d = dataRef.current
    if (!d) return
    const s = d.signals.find((x) => x.id === d.latestSignalId) ?? d.signals[0]
    if (s) triggerFire({ id: s.id, direction: s.direction })
  }, [triggerFire])

  // Operator switches the broadcast book. Re-baselines the fire detector so the
  // switch itself never triggers a fire animation, and clears any live fire.
  const changeBook = useCallback((b: Book) => {
    if (b === bookRef.current) return
    bookRef.current = b
    firstPollDoneRef.current = false
    clearFire()
    setBookState(b)
  }, [clearFire])

  // ── full data poll (5s) — also the fire trigger ──
  useEffect(() => {
    let alive = true
    const pull = async () => {
      const k = tokenRef.current
      if (!k) return
      try {
        const r = await fetch(`/api/live?k=${encodeURIComponent(k)}&book=${bookRef.current}`, { cache: "no-store" })
        if (!r.ok) return
        const d: LiveData = await r.json()
        if (!alive) return

        const latest = d.latestSignalId
        const newestSig = d.signals.find((s) => s.id === latest) ?? d.signals[0]
        const verdictChanged = prevVerdictRef.current !== null && prevVerdictRef.current !== d.regime.verdict

        if (!firstPollDoneRef.current) {
          // First successful poll: record baseline, never fire (no pop on load/restart).
          firstPollDoneRef.current = true
          seenIdRef.current = latest
        } else if (latest != null && (seenIdRef.current == null || latest > seenIdRef.current)) {
          seenIdRef.current = latest
          const dir = newestSig?.direction ?? (d.regime.verdict === "long" ? "long" : "short")
          triggerFire({ id: latest, direction: dir })
        } else if (verdictChanged) {
          // State moved on without a new signal → clear any lingering fire.
          clearFire()
        }
        prevVerdictRef.current = d.regime.verdict

        setData(d)
        setFeedTried(true)
        applyPrices(d.prices)
      } catch { /* keep previous */ }
    }
    pull()
    const id = window.setInterval(pull, 5000)
    return () => { alive = false; window.clearInterval(id) }
  }, [applyPrices, triggerFire, clearFire, book])

  // ── fast prices poll (3s) ──
  useEffect(() => {
    let alive = true
    const pull = async () => {
      const k = tokenRef.current
      if (!k) return
      try {
        const r = await fetch(`/api/live?k=${encodeURIComponent(k)}&mode=prices`, { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        if (!alive) return
        setFeedTried(true)
        if (Array.isArray(d.prices)) applyPrices(d.prices)
        if (d.context) setData((prev) => (prev ? { ...prev, context: d.context } : prev))
      } catch { /* keep previous */ }
    }
    const id = window.setInterval(pull, 3000)
    return () => { alive = false; window.clearInterval(id) }
  }, [applyPrices])

  // keep latest data accessible inside event handlers / the 1s tick
  useEffect(() => { dataRef.current = data }, [data])

  // ── 1s ticks: clock, since, next-scan (next 15-min boundary) ──
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`)
      setDateStr(`${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`.toUpperCase())
      const into = (d.getUTCMinutes() % 15) * 60 + d.getUTCSeconds()
      const remain = 900 - into
      setNextScan(`${pad(Math.floor(remain / 60))}:${pad(remain % 60)}`)
      const last = dataRef.current?.regime.lastSignalAt
      if (last) {
        const s = Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 1000))
        setSince(s < 3600 ? `${Math.floor(s / 60)}m ${pad(s % 60)}s` : `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`)
      } else setSince("—")
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── CTA rotation ──
  useEffect(() => {
    const id = window.setInterval(() => setCtaIdx((i) => (i + 1) % CTA_MSGS.length), 6500)
    return () => window.clearInterval(id)
  }, [])

  // ── QR (encodes the env target) via qrcodejs once loaded ──
  const [qrReady, setQrReady] = useState(false)
  useEffect(() => {
    if (!qrReady) return
    const el = document.getElementById("t365qr")
    const QR = (window as unknown as { QRCode?: new (e: HTMLElement, o: object) => void }).QRCode
    if (!el || !QR) return
    el.innerHTML = ""
    try {
      new QR(el, { text: QR_URL, width: 84, height: 84, colorDark: "#0a0a0a", colorLight: "#f7f1e3", correctLevel: 1 })
    } catch { /* leave empty */ }
  }, [qrReady])

  // clear pending settle timer on unmount
  useEffect(() => () => { if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current) }, [])

  const realVerdict: Verdict = data?.regime.verdict ?? "neutral"
  // Display precedence: a fire/replay wash > the real (book-following) verdict.
  const verdict: Verdict = fireVerdict ?? realVerdict
  const reg = REG[verdict]
  const ctx = data?.context ?? { btcMomentum: null, volatility: null, altBreadth: null }
  const rec = data?.record
  const signals = data?.signals ?? []
  const closed = data?.closed ?? []
  // Closed-sample count for the displayed book (gates the "building" hero).
  const totalClosed =
    book === "short" ? (rec?.short.count ?? 0) :
    book === "long"  ? (rec?.long.count ?? 0) :
                       (rec?.long.count ?? 0) + (rec?.short.count ?? 0)
  const bookLabel = book === "combined" ? "Longs & Shorts" : book === "short" ? "Shorts" : "Longs"

  const regVars: React.CSSProperties & Record<string, string> = {
    "--reg-c": reg.c, "--reg-h": reg.c,
    "--reg-glow": reg.c + "cc", "--reg-hglow": reg.c + "47",
    "--reg-tint": reg.c + "1a", "--reg-border": reg.c + "3a",
    "--lv-c": reg.c, "--lv-tint": reg.c + "1f", "--lv-bd": reg.c + "66",
    "--acc": reg.c, "--acc-glow": reg.c + "73",
  }

  const gauges: Array<{ k: string; level: number; v: string }> = [
    { k: "BTC Momentum", level: momentumLevel(ctx.btcMomentum), v: ctx.btcMomentum == null ? "—" : `${ctx.btcMomentum >= 0 ? "+" : ""}${ctx.btcMomentum.toFixed(1)}% 24h` },
    { k: "Volatility", level: volLevel(ctx.volatility), v: ctx.volatility == null ? "—" : `${ctx.volatility.toFixed(1)}% range` },
    { k: "Alt Breadth", level: breadthLevel(ctx.altBreadth), v: ctx.altBreadth == null ? "—" : `${Math.round(ctx.altBreadth)}% green` },
  ]

  return (
    <div className="t365-live">
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" strategy="afterInteractive" onLoad={() => setQrReady(true)} />
      <div className="stage" ref={stageRef}>
        {/* On-stream operator controls — intentionally visible, never gated.
            Book switch filters the feed, closed panel + track record. */}
        <div className="controls">
          <span className="ctl-label">Book</span>
          <button className={book === "short" ? "active" : ""} onClick={() => changeBook("short")}>Shorts</button>
          <button className={book === "long" ? "active" : ""} onClick={() => changeBook("long")}>Longs</button>
          <button className={book === "combined" ? "active" : ""} onClick={() => changeBook("combined")}>Combined</button>
          <span className="sep" />
          <button className="fire" onClick={fireLatest}>⚡ Fire a signal</button>
        </div>

        {/* HEADER — persistent site URL beside the brand */}
        <header className="head">
          <div className="brand">
            <h1>TRADING365</h1>
            <span className="sub">Live Altcoin Scanner · {bookLabel}</span>
            <span className="url">{SITE_HOST}</span>
          </div>
          <div className="head-right">
            <div className="live"><span className="dot" /> ON AIR</div>
            <div className="clock">
              <div className="t"><span>{clock}</span><span className="z">UTC</span></div>
              <div className="d">{dateStr}</div>
            </div>
          </div>
        </header>

        <div className="main">
          {/* LEFT: market + scoreboard */}
          <div className="col">
            <section className="panel market">
              <div className="eyebrow">Market</div>
              <div className="rows">
                {prices.map((p) => (
                  <div className="mrow" key={p.symbol}>
                    <span className="sym">{p.symbol}</span>
                    <span className={`px${flash[p.symbol] ? " flash-" + flash[p.symbol] : ""}`}>${decPrice(p.price)}</span>
                    <span className={`chg ${p.change24h >= 0 ? "up" : "down"}`}>{p.change24h >= 0 ? "+" : ""}{p.change24h.toFixed(1)}%</span>
                  </div>
                ))}
                {prices.length === 0 && (
                  <div className="mrow"><span className="sym" style={{ color: "var(--dim)" }}>{feedTried ? "Feed unavailable" : "Loading…"}</span><span /><span /></div>
                )}
              </div>
            </section>

            <section className="panel score">
              <div className="eyebrow">Track Record · Last 30 Days</div>
              <div className="hero-stat">
                {totalClosed < MIN_SAMPLE ? (
                  <>
                    <div className="big" style={{ fontSize: 44 }}>building</div>
                    <div className="lbl">{totalClosed} closed signal{totalClosed === 1 ? "" : "s"} so far</div>
                  </>
                ) : (
                  <>
                    <div className="big">{Math.round(rec!.combinedHitRate!)}<span style={{ fontSize: 34 }}>%</span></div>
                    <div className="lbl">{book === "combined" ? "Combined" : book === "short" ? "Short" : "Long"} hit rate (TP1+)</div>
                  </>
                )}
              </div>
              <div className="split">
                {book !== "long" && <div className="b"><span className="lk s">Shorts</span><span className="lv">{sideContent(rec?.short)}</span></div>}
                {book !== "short" && <div className="b"><span className="lk l">Longs</span><span className="lv">{sideContent(rec?.long)}</span></div>}
              </div>
              <div className="pnl-row">
                <span className="k">Avg move / signal</span>
                <span className="v">{rec?.avgMove == null ? "—" : `${rec.avgMove >= 0 ? "+" : "−"}${Math.abs(rec.avgMove).toFixed(1)}%`}</span>
              </div>
            </section>
          </div>

          {/* RIGHT: regime + feed */}
          <div className="rcol">
            <section className="panel regime" style={regVars}>
              <div className="fireflash" ref={fireflashRef} />
              <div className="top">
                <div className="eyebrow">Market Regime</div>
                <div className="timers">
                  <div className="ls">last signal fired <b>{since}</b> ago</div>
                  <div className="nx">next scan in <b>{nextScan}</b></div>
                </div>
              </div>
              <div className="stateline-row">
                <div className="state"><span className="orb" /><span className="txt">{reg.state}</span></div>
                <div className="firebanner" ref={firebannerRef}><span className="fb-txt" ref={fbTxtRef} /></div>
              </div>
              <h2>{reg.head}</h2>
              <p className="desc">{reg.desc}</p>

              <div className="tri">
                <div className={`seg long${verdict === "long" ? " on" : ""}`}><span className="d" />LONG</div>
                <div className={`seg neutral${verdict === "neutral" ? " on" : ""}`}><span className="d" />NEUTRAL</div>
                <div className={`seg short${verdict === "short" ? " on" : ""}`}><span className="d" />SHORT</div>
              </div>

              <div className="ctx">
                <div className="ctx-eyebrow">Market Context</div>
                <div className="gauges">
                  {gauges.map((g) => (
                    <div className="gauge" key={g.k}>
                      <div className="gk">{g.k}</div>
                      <div className="bars">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < g.level ? "on" : ""} />)}</div>
                      <div className="gv">{g.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="feeds">
              {/* LEFT — Recent open/live fires */}
              <section className="panel feed recent">
                <div className="eyebrow" style={{ marginBottom: 4 }}>Recent Signals · Live</div>
                <div className="fhead">
                  <span>Pair</span><span>Side</span><span className="r">Entry</span>
                  <span>TP1 / TP2 / TP3</span><span className="r">Sc</span><span className="r">Ago</span>
                </div>
                <div className="rows">
                  {signals.map((s) => {
                    const firing = firingId === s.id
                    const held = heldId === s.id
                    const cls = firing ? "frow firerow live" : held ? "frow held" : `frow${s.live ? " live" : ""}`
                    return (
                      <div className={cls} key={s.id}>
                        <span className="pair">{s.pair}{(s.live || firing) && <span className="lflag">● LIVE</span>}</span>
                        <span className={`dir ${s.direction === "long" ? "L" : "S"}`}>{s.direction === "long" ? "LONG" : "SHORT"}</span>
                        <span className="entry">{fmtEntry(s.entry)}</span>
                        <span className="tps">{[s.tp1, s.tp2, s.tp3].map((h, i) => <span key={i} className={`tp ${h ? "hit" : "pend"}`}>TP{i + 1}</span>)}</span>
                        <span className="sc">{s.score}</span>
                        <span className="ago">{fmtAgo(s.time)}</span>
                      </div>
                    )
                  })}
                  {signals.length === 0 && <div className="frow"><span className="pair" style={{ color: "var(--dim)" }}>No open signals</span></div>}
                </div>
              </section>

              {/* RIGHT — most recent matured results */}
              <section className="panel feed closed">
                <div className="eyebrow" style={{ marginBottom: 4 }}>Closed · Last Results</div>
                <div className="fhead">
                  <span>Pair</span><span>Side</span><span className="r">Result</span><span className="r">Ago</span>
                </div>
                <div className="rows">
                  {closed.map((c) => (
                    <div className="frow" key={c.id}>
                      <span className="pair">{c.pair}</span>
                      <span className={`dir ${c.direction === "long" ? "L" : "S"}`}>{c.direction === "long" ? "LONG" : "SHORT"}</span>
                      <span className={`res ${c.win ? "win" : "loss"}`}>{c.result}</span>
                      <span className="ago">{fmtAgo(c.time)}</span>
                    </div>
                  ))}
                  {closed.length === 0 && <div className="frow"><span className="pair" style={{ color: "var(--dim)" }}>No closed results yet</span></div>}
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* BOTTOM: persistent site tag (CTA) + rotating strip + single QR */}
        <div className="bottom">
          <footer className="cta">
            <div className="tag">{SITE_HOST}</div>
            <div className="msgwrap">
              {CTA_MSGS.map((m, i) => (
                <div key={i} className={`msg${i === ctaIdx ? " show" : ""}`} dangerouslySetInnerHTML={{ __html: m }} />
              ))}
            </div>
          </footer>
          {PARTNER.name && (
            <div className="partner">
              <span className="plabel">Preferred Partner</span>
              <span className="pname">{PARTNER.name}</span>
              <span className="pmsg">↳ {PARTNER.msg}</span>
            </div>
          )}
          <div className="qrcard" ref={qrcardRef}>
            <div className="qbox"><div id="t365qr" /></div>
            <div className="qt">
              <span className="h">SCAN TO VISIT</span>
              <span className="p">Reviews, fees &amp; sign-up bonuses</span>
              <span className="pr">{QR_HOST}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
