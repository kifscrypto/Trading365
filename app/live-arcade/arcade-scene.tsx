"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"
import type { Book, LiveData, LivePrice, LiveSideRecord, Verdict } from "@/lib/live-types"

// Mirrors /live's data layer but renders a game-dominant layout: the scanner is
// condensed into a left rail beside a large game-window placeholder (composite a
// gameplay capture over it in OBS). Reuses /api/live + the ?k= token + live.css
// panel styles. The original /live scene is intentionally left untouched.

const MIN_SAMPLE = 20
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.trading365.org"
const SUB_URL = process.env.NEXT_PUBLIC_SUB_URL || "https://t.me/trading365Sub"
const QR_URL = process.env.NEXT_PUBLIC_QR_TARGET_URL || SITE_URL
const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")
const SITE_HOST = host(SITE_URL)
const SUB_HANDLE = host(SUB_URL)
const QR_HOST = host(QR_URL)

const CTA_MSGS = [
  `Independent exchange reviews, fees &amp; sign-up bonuses → <b>${SITE_HOST}</b>`,
  `Live signal alerts in the premium group → <b>${SUB_HANDLE}</b>`,
  `Long or short, every fire hits the premium group in real time`,
]

// Preferred-partner slot in the bottom band. Blank for now — set `name` (and an
// optional `msg`) to fill it; the box stays reserved/visible while empty.
const PARTNER = { name: "", msg: "" }

const REG: Record<Verdict, { state: string; c: string }> = {
  long: { state: "LONG BOOK · LIVE", c: "#37d98a" },
  short: { state: "SHORT BOOK · LIVE", c: "#ff4d5e" },
  neutral: { state: "STANDING DOWN", c: "#ff9d2e" },
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
function fmtHM(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
function fmtPct(n: number | null, digits = 0): string {
  return n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`
}
function fmtRet(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`
}
function fmtUsd0(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}
function sideContent(side?: LiveSideRecord) {
  const count = side?.count ?? 0
  if (count < MIN_SAMPLE) return <>building ({count})</>
  return <>{fmtPct(side!.hitRate)} <small>/ {count}</small></>
}

export function ArcadeScene() {
  const stageRef = useRef<HTMLDivElement>(null)
  const tokenRef = useRef<string | null>(null)
  const prevPrices = useRef<Record<string, number>>({})

  const [data, setData] = useState<LiveData | null>(null)
  const [prices, setPrices] = useState<LivePrice[]>([])
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({})
  const [clock, setClock] = useState("00:00:00")
  const [dateStr, setDateStr] = useState("—")
  const [nextScan, setNextScan] = useState("--:--")
  const [ctaIdx, setCtaIdx] = useState(0)
  const [feedTried, setFeedTried] = useState(false)
  const [chroma, setChroma] = useState<string | null>(null)

  const [firingId, setFiringId] = useState<number | null>(null)
  const [heldId, setHeldId] = useState<number | null>(null)
  const [fireMsg, setFireMsg] = useState<string | null>(null)
  const [book, setBookState] = useState<Book>("combined")
  const bookRef = useRef<Book>("combined")
  const seenIdRef = useRef<number | null>(null)
  const firstPollDoneRef = useRef(false)
  const settleTimerRef = useRef<number | null>(null)
  const dataRef = useRef<LiveData | null>(null)

  // scale-to-fit 1920×1080
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
    const params = new URLSearchParams(window.location.search)
    tokenRef.current = params.get("k")
    const key = (params.get("key") || "").toLowerCase()
    if (key === "green") setChroma("#00b140")
    else if (key === "magenta" || key === "pink") setChroma("#ff00ff")
    else if (key === "blue") setChroma("#0047ff")
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

  const triggerFire = useCallback((sig: { id: number; direction: "long" | "short" }) => {
    if (settleTimerRef.current) { window.clearTimeout(settleTimerRef.current); settleTimerRef.current = null }
    setHeldId(null)
    setFiringId(sig.id)
    setFireMsg(`⚡ SIGNAL FIRED · ${sig.direction === "long" ? "LONG" : "SHORT"}`)
    settleTimerRef.current = window.setTimeout(() => {
      setFiringId(null)
      setHeldId(sig.id)
      setFireMsg(null)
      settleTimerRef.current = null
    }, 12000)
  }, [])

  const fireLatest = useCallback(() => {
    const d = dataRef.current
    if (!d) return
    const s = d.signals.find((x) => x.id === d.latestSignalId) ?? d.signals[0]
    if (s) triggerFire({ id: s.id, direction: s.direction })
  }, [triggerFire])

  const changeBook = useCallback((b: Book) => {
    if (b === bookRef.current) return
    bookRef.current = b
    firstPollDoneRef.current = false
    if (settleTimerRef.current) { window.clearTimeout(settleTimerRef.current); settleTimerRef.current = null }
    setFiringId(null); setHeldId(null); setFireMsg(null)
    setBookState(b)
  }, [])

  // full data poll (5s) — also the fire trigger
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
        if (!firstPollDoneRef.current) {
          firstPollDoneRef.current = true
          seenIdRef.current = latest
        } else if (latest != null && (seenIdRef.current == null || latest > seenIdRef.current)) {
          seenIdRef.current = latest
          const dir = newestSig?.direction ?? (d.regime.verdict === "long" ? "long" : "short")
          triggerFire({ id: latest, direction: dir })
        }
        setData(d)
        setFeedTried(true)
        applyPrices(d.prices)
      } catch { /* keep previous */ }
    }
    pull()
    const id = window.setInterval(pull, 5000)
    return () => { alive = false; window.clearInterval(id) }
  }, [applyPrices, triggerFire, book])

  // fast prices poll (3s)
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

  useEffect(() => { dataRef.current = data }, [data])

  // 1s ticks: clock, next-scan
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`)
      setDateStr(`${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`.toUpperCase())
      const into = (d.getUTCMinutes() % 15) * 60 + d.getUTCSeconds()
      const remain = 900 - into
      setNextScan(`${pad(Math.floor(remain / 60))}:${pad(remain % 60)}`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setCtaIdx((i) => (i + 1) % CTA_MSGS.length), 6500)
    return () => window.clearInterval(id)
  }, [])

  // QR
  const [qrReady, setQrReady] = useState(false)
  useEffect(() => {
    if (!qrReady) return
    const el = document.getElementById("arcqr")
    const QR = (window as unknown as { QRCode?: new (e: HTMLElement, o: object) => void }).QRCode
    if (!el || !QR) return
    el.innerHTML = ""
    try { new QR(el, { text: QR_URL, width: 76, height: 76, colorDark: "#0a0a0a", colorLight: "#f7f1e3", correctLevel: 1 }) } catch { /* leave empty */ }
  }, [qrReady])

  useEffect(() => () => { if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current) }, [])

  const verdict: Verdict = data?.regime.verdict ?? "neutral"
  const reg = REG[verdict]
  const rec = data?.record
  const pnl = data?.pnl
  const signals = data?.signals ?? []
  const totalClosed =
    book === "short" ? (rec?.short.count ?? 0) :
    book === "long"  ? (rec?.long.count ?? 0) :
                       (rec?.long.count ?? 0) + (rec?.short.count ?? 0)
  const bookLabel = book === "combined" ? "Longs & Shorts" : book === "short" ? "Shorts" : "Longs"

  const regVars: React.CSSProperties & Record<string, string> = {
    "--reg-c": reg.c, "--acc": reg.c, "--acc-glow": reg.c + "73",
    "--lv-c": reg.c, "--lv-tint": reg.c + "1f", "--lv-bd": reg.c + "66",
  }

  // Ticker content: most recent signals as chips.
  const tickerSignals = signals.slice(0, 10)

  return (
    <div className="t365-live t365-arcade" style={regVars}>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" strategy="afterInteractive" onLoad={() => setQrReady(true)} />
      <div className="stage arc-stage" ref={stageRef}>
        <div className="controls">
          <span className="ctl-label">Book</span>
          <button className={book === "short" ? "active" : ""} onClick={() => changeBook("short")}>Shorts</button>
          <button className={book === "long" ? "active" : ""} onClick={() => changeBook("long")}>Longs</button>
          <button className={book === "combined" ? "active" : ""} onClick={() => changeBook("combined")}>Combined</button>
          <span className="sep" />
          <button className="fire" onClick={fireLatest}>⚡ Fire a signal</button>
        </div>

        <header className="head">
          <div className="brand">
            <h1>TRADING365</h1>
            <span className="sub">Live Scanner · Arcade · {bookLabel}</span>
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

        <div className="arc-main">
          {/* LEFT RAIL — condensed scanner */}
          <div className="col arc-rail">
            <section className="panel market">
              <div className="eyebrow">Market</div>
              <div className="rows">
                {prices.slice(0, 5).map((p) => (
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
              <div className="eyebrow">Signal Hit Rate · 30d</div>
              <div className="hero-stat">
                {totalClosed < MIN_SAMPLE ? (
                  <>
                    <div className="big" style={{ fontSize: 40 }}>building</div>
                    <div className="lbl">{totalClosed} closed so far</div>
                  </>
                ) : (
                  <>
                    <div className="big">{Math.round(rec!.combinedHitRate!)}<span style={{ fontSize: 28 }}>%</span></div>
                    <div className="lbl">{book === "combined" ? "Combined" : book === "short" ? "Short" : "Long"} hit rate (TP1+)</div>
                  </>
                )}
              </div>
              <div className="split">
                {book !== "long" && <div className="b"><span className="lk s">Shorts</span><span className="lv">{sideContent(rec?.short)}</span></div>}
                {book !== "short" && <div className="b"><span className="lk l">Longs</span><span className="lv">{sideContent(rec?.long)}</span></div>}
              </div>
            </section>

            {/* Compact P&L row */}
            <section className="panel arc-pnl">
              <div className="eyebrow">Simulated P&amp;L · $1,000</div>
              <div className="arc-pnl-cards">
                {([
                  { key: "combined", label: "Combined", cls: "c" },
                  { key: "short", label: "Shorts", cls: "s" },
                  { key: "long", label: "Longs", cls: "l" },
                ] as const).map(({ key, label, cls }) => {
                  const b = pnl?.[key]
                  const ret = b?.returnPct ?? 0
                  const has = b && b.trades > 0
                  return (
                    <div className={`arc-pcard ${cls}`} key={key}>
                      <div className="apk">{label}</div>
                      <div className={`apr ${ret >= 0 ? "up" : "down"}`}>{has ? fmtRet(ret) : "—"}</div>
                      <div className="apbal">{has ? fmtUsd0(b!.balance) : "building"}</div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Recent signals — the headline panel of the rail */}
            <section className="panel feed recent arc-recent">
              <div className="arc-recent-head">
                <span className="eyebrow">Recent Signals · Live</span>
                <span className="arc-scan">next scan {nextScan}</span>
              </div>
              <div className="fhead">
                <span>Pair</span><span>Side</span><span className="r">Entry</span><span className="r">Sc</span>
              </div>
              <div className="rows">
                {signals.slice(0, 8).map((s) => {
                  const firing = firingId === s.id
                  const held = heldId === s.id
                  const profit = s.tp1 || s.tp2 || s.tp3
                  let cls = firing ? "frow firerow live" : held ? "frow held" : `frow${s.live ? " live" : ""}`
                  if (profit) cls += " profit"
                  return (
                    <div className={cls} key={s.id}>
                      <span className="pair">
                        <span className="pname">{s.pair}{(s.live || firing) && <span className="lflag">● LIVE</span>}</span>
                        <span className="psub">{s.exchange} · {fmtAgo(s.time)}</span>
                      </span>
                      <span className={`dir ${s.direction === "long" ? "L" : "S"}`}>{s.direction === "long" ? "LONG" : "SHORT"}</span>
                      <span className="entry">{fmtEntry(s.entry)}</span>
                      <span className="sc">{s.score}</span>
                    </div>
                  )
                })}
                {signals.length === 0 && <div className="frow"><span className="pair" style={{ color: "var(--dim)" }}>No open signals</span></div>}
              </div>
            </section>
          </div>

          {/* RIGHT — game window + ticker */}
          <div className="arc-right">
            <div className={`gameframe${chroma ? " keyed" : ""}`} style={chroma ? { background: chroma } : undefined}>
              <span className="gf-corner tl" /><span className="gf-corner tr" />
              <span className="gf-corner bl" /><span className="gf-corner br" />
              {!chroma && (
                <div className="gf-label">
                  <div className="gf-eyebrow">MEME ASYLUM · ARCADE</div>
                  <div className="gf-title">GAMEPLAY</div>
                  <div className="gf-note">live capture · composite in OBS</div>
                </div>
              )}
            </div>

            <div className={`arc-ticker${fireMsg ? " firing" : ""}`}>
              <div className="arc-ticker-label">{fireMsg ? <span className="tk-fire">{fireMsg}</span> : <>LIVE&nbsp;SIGNALS</>}</div>
              <div className="arc-ticker-track">
                <div className="arc-ticker-run">
                  {tickerSignals.concat(tickerSignals).map((s, i) => (
                    <span className="tk-chip" key={`${s.id}-${i}`}>
                      <b className={s.direction === "long" ? "L" : "S"}>{s.direction === "long" ? "LONG" : "SHORT"}</b>
                      <span className="tk-pair">{s.pair}</span>
                      <span className="tk-entry">@ {fmtEntry(s.entry)}</span>
                      <span className="tk-time">{fmtHM(s.time)} · {fmtAgo(s.time)} ago</span>
                      <span className="tk-sc">sc {s.score}</span>
                    </span>
                  ))}
                  {tickerSignals.length === 0 && <span className="tk-chip"><span className="tk-pair" style={{ color: "var(--dim)" }}>Awaiting signals…</span></span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: CTA + QR */}
        <div className="bottom">
          <footer className="cta">
            <div className="tag">{SITE_HOST}</div>
            <div className="msgwrap">
              {CTA_MSGS.map((m, i) => (
                <div key={i} className={`msg${i === ctaIdx ? " show" : ""}`} dangerouslySetInnerHTML={{ __html: m }} />
              ))}
            </div>
          </footer>
          <div className="partner">
            <span className="plabel">Preferred Partner</span>
            {PARTNER.name ? (
              <>
                <span className="pname">{PARTNER.name}</span>
                {PARTNER.msg && <span className="pmsg">↳ {PARTNER.msg}</span>}
              </>
            ) : (
              <span className="pname arc-partner-empty">—</span>
            )}
          </div>
          <div className="qrcard">
            <div className="qbox"><div id="arcqr" /></div>
            <div className="qt">
              <span className="h">SCAN TO VISIT</span>
              <span className="p">Reviews, fees &amp; bonuses</span>
              <span className="pr">{QR_HOST}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
