"use client"

import { useState, useMemo } from "react"
import { exchanges } from "@/lib/data/exchanges"
import type { Exchange } from "@/lib/data/types"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import {
  Check, X, ExternalLink, ArrowRight, ChevronUp, ChevronDown,
  SlidersHorizontal, RotateCcw, GitCompareArrows,
} from "lucide-react"

type SortKey = "rating" | "fees.maker" | "leverage" | "bonusAmount" | "tradingPairs"
type SortDir = "asc" | "desc"
type Country = "US" | "UK" | "AU" | "CA" | "EU" | "ASIA"

const COUNTRIES: Country[] = ["US", "UK", "AU", "CA", "EU", "ASIA"]

function getSortValue(e: Exchange, key: SortKey): number {
  if (key === "rating") return e.rating
  if (key === "bonusAmount") return e.bonusAmount
  if (key === "tradingPairs") return e.tradingPairs
  if (key === "fees.maker") return parseFloat(e.fees.maker.replace("%", ""))
  if (key === "leverage") return parseInt(e.leverage?.replace("x", "") ?? "0")
  return 0
}

export function CompareClient() {
  // Filters
  const [filterKYC, setFilterKYC] = useState<"all" | "no-kyc" | "kyc">("all")
  const [filterCopyTrading, setFilterCopyTrading] = useState(false)
  const [filterDebitCard, setFilterDebitCard] = useState(false)
  const [filterFiat, setFilterFiat] = useState(false)
  const [filterCountry, setFilterCountry] = useState<Country | "all">("all")

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("rating")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // 3 compare slots — dropdowns and table checkboxes both write here
  const [slots, setSlots] = useState<[string, string, string]>(["", "", ""])

  const selected = slots.filter(Boolean)
  const selectedExchanges = selected.map((s) => exchanges.find((e) => e.slug === s)!).filter(Boolean)

  function setSlot(i: 0 | 1 | 2, slug: string) {
    setSlots((prev) => {
      const next = [...prev] as [string, string, string]
      next[i] = slug
      return next
    })
  }

  function toggleTableSelect(slug: string) {
    const existingIdx = slots.findIndex((s) => s === slug)
    if (existingIdx !== -1) {
      setSlot(existingIdx as 0 | 1 | 2, "")
    } else {
      const emptyIdx = slots.findIndex((s) => s === "")
      if (emptyIdx !== -1) {
        setSlots((prev) => {
          const next = [...prev] as [string, string, string]
          next[emptyIdx] = slug
          return next
        })
      }
    }
  }

  function optionsFor(slotIdx: number) {
    const others = slots.filter((_, i) => i !== slotIdx)
    return exchanges.filter((e) => !others.includes(e.slug))
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "fees.maker" ? "asc" : "desc")
    }
  }

  function resetFilters() {
    setFilterKYC("all")
    setFilterCopyTrading(false)
    setFilterDebitCard(false)
    setFilterFiat(false)
    setFilterCountry("all")
  }

  const filtered = useMemo(() => {
    return exchanges
      .filter((e) => {
        if (filterKYC === "no-kyc" && e.kyc) return false
        if (filterKYC === "kyc" && !e.kyc) return false
        if (filterCopyTrading && !e.copyTrading) return false
        if (filterDebitCard && !e.debitCard) return false
        if (filterFiat && !e.fiatDeposit) return false
        if (filterCountry !== "all" && !e.countries[filterCountry]) return false
        return true
      })
      .sort((a, b) => {
        const av = getSortValue(a, sortKey)
        const bv = getSortValue(b, sortKey)
        return sortDir === "asc" ? av - bv : bv - av
      })
  }, [filterKYC, filterCopyTrading, filterDebitCard, filterFiat, filterCountry, sortKey, sortDir])

  const hasFilters = filterKYC !== "all" || filterCopyTrading || filterDebitCard || filterFiat || filterCountry !== "all"

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="h-3 w-3 opacity-20" />
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-primary" />
      : <ChevronDown className="h-3 w-3 text-primary" />
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Breadcrumbs items={[{ label: "Compare Exchanges" }]} />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
            Crypto Exchange Comparison Tool
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Filter, sort, and compare crypto exchanges side-by-side on fees, leverage, KYC, bonuses, copy trading, and more.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <div className="border-b border-amber-500/20 bg-amber-500/5">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <p className="text-xs text-amber-400/80">
            <span className="font-semibold text-amber-400">Important:</span> Most exchanges now require full KYC due to global regulations. Exchanges marked "No KYC" offer limited access without verification — withdrawal caps apply. Almost all exchanges listed do not officially support US residents. Bonus figures are marketing maximums; real usable value is typically much lower and subject to trading volume requirements.
          </p>
        </div>
      </div>

      {/* ── COMPARE TOOL — always visible, always at top ── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center gap-2 mb-4">
            <GitCompareArrows className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Compare in Detail</h2>
            {selected.length > 0 && (
              <button
                onClick={() => setSlots(["", "", ""])}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {/* Exchange dropdowns */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([0, 1, 2] as const).map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Exchange {i + 1}{i === 2 ? " (optional)" : ""}
                </label>
                <select
                  value={slots[i]}
                  onChange={(ev) => setSlot(i, ev.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">— Select exchange —</option>
                  {optionsFor(i).map((ex) => (
                    <option key={ex.slug} value={ex.slug}>{ex.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {selectedExchanges.length < 2 && (
            <p className="mt-4 rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Select at least 2 exchanges above — or tick checkboxes in the table below — to see a full side-by-side comparison.
            </p>
          )}

          {/* Detail comparison table */}
          {selectedExchanges.length >= 2 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-border">
              {/* Header */}
              <div
                className="grid border-b border-border bg-secondary/50"
                style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
              >
                <div className="p-4 text-sm font-medium text-muted-foreground">Feature</div>
                {selectedExchanges.map((e) => (
                  <div key={e.slug} className="border-l border-border p-4 text-center">
                    <span className="text-lg font-bold text-foreground">{e.name}</span>
                    <div className="mt-1">
                      <Badge variant="outline" className="border-primary/40 text-primary font-mono text-xs">
                        {e.rating}/10
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {[
                { label: "Maker Fee", get: (e: Exchange) => e.fees.maker },
                { label: "Taker Fee", get: (e: Exchange) => e.fees.taker },
                { label: "Max Leverage", get: (e: Exchange) => e.leverage ?? "—" },
                { label: "KYC Required", get: (e: Exchange) => e.kyc, bool: true, inverse: true },
                { label: "KYC Details", get: (e: Exchange) => e.kycNote ?? "—" },
                { label: "Sign-Up Bonus", get: (e: Exchange) => e.bonus },
                { label: "Copy Trading", get: (e: Exchange) => !!e.copyTrading, bool: true },
                { label: "Debit Card", get: (e: Exchange) => e.debitCard, bool: true },
                { label: "Fiat Deposits", get: (e: Exchange) => e.fiatDeposit, bool: true },
                { label: "Deposit Methods", get: (e: Exchange) => e.depositMethods.join(", ") },
                { label: "Trading Pairs", get: (e: Exchange) => `${e.tradingPairs.toLocaleString()}+` },
                { label: "Min Deposit", get: (e: Exchange) => e.minDeposit },
                { label: "Withdrawal Speed", get: (e: Exchange) => e.withdrawalSpeed },
                { label: "Founded", get: (e: Exchange) => e.founded },
                { label: "Headquarters", get: (e: Exchange) => e.headquarters },
              ].map((row, i) => (
                <div
                  key={row.label}
                  className={`grid border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-secondary/20"}`}
                  style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
                >
                  <div className="flex items-center p-4 text-sm font-medium text-muted-foreground">{row.label}</div>
                  {selectedExchanges.map((e) => (
                    <div key={e.slug} className="flex items-center justify-center border-l border-border p-4 text-sm text-foreground">
                      {row.bool
                        ? <BoolCell value={!!row.get(e)} inverse={row.inverse} />
                        : <span className="text-center">{String(row.get(e))}</span>
                      }
                    </div>
                  ))}
                </div>
              ))}

              {/* Countries */}
              <div
                className="grid border-b border-border bg-card"
                style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
              >
                <div className="flex items-center p-4 text-sm font-medium text-muted-foreground">Countries</div>
                {selectedExchanges.map((e) => (
                  <div key={e.slug} className="border-l border-border p-4 flex flex-wrap justify-center gap-1">
                    {COUNTRIES.map((c) => (
                      <span
                        key={c}
                        className={`text-xs rounded px-2 py-0.5 font-mono ${
                          e.countries[c]
                            ? "bg-green-500/15 text-green-400"
                            : "bg-secondary text-muted-foreground/40 line-through"
                        }`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {/* Security */}
              <div
                className="grid border-b border-border bg-secondary/20"
                style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
              >
                <div className="flex items-start p-4 text-sm font-medium text-muted-foreground">Security</div>
                {selectedExchanges.map((e) => (
                  <div key={e.slug} className="border-l border-border p-4 flex flex-wrap justify-center gap-1">
                    {e.securityFeatures.map((f) => (
                      <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                ))}
              </div>

              {/* Pros */}
              <div
                className="grid border-b border-border bg-card"
                style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
              >
                <div className="flex items-start p-4 text-sm font-medium text-muted-foreground">Pros</div>
                {selectedExchanges.map((e) => (
                  <div key={e.slug} className="border-l border-border p-4">
                    <ul className="space-y-1.5">
                      {e.pros.map((p) => (
                        <li key={p} className="flex items-start gap-2 text-xs text-foreground">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Cons */}
              <div
                className="grid bg-secondary/20"
                style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}
              >
                <div className="flex items-start p-4 text-sm font-medium text-muted-foreground">Cons</div>
                {selectedExchanges.map((e) => (
                  <div key={e.slug} className="border-l border-border p-4">
                    <ul className="space-y-1.5">
                      {e.cons.map((c) => (
                        <li key={c} className="flex items-start gap-2 text-xs text-foreground">
                          <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTAs */}
          {selectedExchanges.length >= 2 && (
            <>
              <div
                className="mt-6 grid gap-4"
                style={{ gridTemplateColumns: `repeat(${selectedExchanges.length}, 1fr)` }}
              >
                {selectedExchanges.map((e) => (
                  <a
                    key={e.slug}
                    href={e.referralLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-center font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Sign Up for {e.name} <ExternalLink className="h-4 w-4" />
                  </a>
                ))}
              </div>
              <div
                className="mt-4 grid gap-4"
                style={{ gridTemplateColumns: `repeat(${selectedExchanges.length}, 1fr)` }}
              >
                {selectedExchanges.map((e) => (
                  <Link
                    key={e.slug}
                    href={e.fullReview}
                    className="flex items-center justify-center gap-1 text-sm text-primary hover:underline"
                  >
                    Full {e.name} review <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Popular Comparisons */}
      <section className="border-b border-border bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Popular Comparisons</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { a: "bybit", b: "bydfi", label: "Bybit vs BYDFi" },
              { a: "bybit", b: "mexc", label: "Bybit vs MEXC" },
              { a: "bybit", b: "okx", label: "Bybit vs OKX" },
              { a: "mexc", b: "bydfi", label: "MEXC vs BYDFi" },
              { a: "bitget", b: "bingx", label: "Bitget vs BingX" },
              { a: "weex", b: "blofin", label: "WEEX vs BloFin" },
              { a: "kucoin", b: "gateio", label: "KuCoin vs Gate.io" },
              { a: "mexc", b: "kucoin", label: "MEXC vs KuCoin" },
              { a: "bybit", b: "bitget", label: "Bybit vs Bitget" },
              { a: "okx", b: "kucoin", label: "OKX vs KuCoin" },
            ].map((pair) => (
              <button
                key={pair.label}
                onClick={() => setSlots([pair.a, pair.b, ""])}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/50"
              >
                {pair.label}
                <ArrowRight className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-0 z-10 border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />

            <div className="flex overflow-hidden rounded-lg border border-border text-xs">
              {(["all", "no-kyc", "kyc"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilterKYC(v)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    filterKYC === v
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {v === "all" ? "Any KYC" : v === "no-kyc" ? "No KYC" : "KYC OK"}
                </button>
              ))}
            </div>

            <div className="flex overflow-hidden rounded-lg border border-border text-xs">
              <button
                onClick={() => setFilterCountry("all")}
                className={`px-3 py-1.5 transition-colors ${filterCountry === "all" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-secondary"}`}
              >
                All Countries
              </button>
              {COUNTRIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCountry(filterCountry === c ? "all" : c)}
                  className={`px-3 py-1.5 transition-colors ${filterCountry === c ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {c}
                </button>
              ))}
            </div>

            {[
              { label: "Copy Trading", value: filterCopyTrading, set: setFilterCopyTrading },
              { label: "Debit Card", value: filterDebitCard, set: setFilterDebitCard },
              { label: "Fiat Deposits", value: filterFiat, set: setFilterFiat },
            ].map(({ label, value, set }) => (
              <button
                key={label}
                onClick={() => set(!value)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}

            {hasFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {exchanges.length} exchanges
            </span>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left">
                <th className="w-8 px-4 py-3 text-xs font-medium text-muted-foreground">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Exchange</th>
                <th className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort("rating")}>
                  <div className="flex items-center gap-1">Rating <SortIcon k="rating" /></div>
                </th>
                <th className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort("fees.maker")}>
                  <div className="flex items-center gap-1">Maker Fee <SortIcon k="fees.maker" /></div>
                </th>
                <th className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort("leverage")}>
                  <div className="flex items-center gap-1">Leverage <SortIcon k="leverage" /></div>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort("bonusAmount")}>
                  <div className="flex items-center gap-1">Bonus <SortIcon k="bonusAmount" /></div>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Copy Trading</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Debit Card</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Fiat</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Countries</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => {
                const sel = slots.includes(e.slug)
                const full = selected.length >= 3 && !sel
                return (
                  <tr
                    key={e.slug}
                    className={`transition-colors ${sel ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleTableSelect(e.slug)}
                        disabled={full}
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                          sel
                            ? "border-primary bg-primary"
                            : full
                            ? "cursor-not-allowed border-border opacity-30"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {sel && <Check className="h-3 w-3 text-primary-foreground" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={e.referralLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        {e.name}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-primary">{e.rating}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">{e.fees.maker}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{e.leverage ?? "—"}</td>
                    <td className="px-4 py-3">
                      {e.kyc ? (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <Check className="h-3 w-3" /> Required
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <X className="h-3 w-3" /> Not required
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{e.bonus}</td>
                    <td className="px-4 py-3"><BoolCell value={!!e.copyTrading} /></td>
                    <td className="px-4 py-3"><BoolCell value={e.debitCard} /></td>
                    <td className="px-4 py-3"><BoolCell value={e.fiatDeposit} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-0.5">
                        {COUNTRIES.map((c) => (
                          <span
                            key={c}
                            className={`rounded px-1 py-0.5 font-mono text-[10px] ${
                              e.countries[c]
                                ? "bg-green-500/15 text-green-400"
                                : "bg-secondary text-muted-foreground/40"
                            }`}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={e.fullReview}
                        className="flex items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline"
                      >
                        Review <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                    No exchanges match your filters.{" "}
                    <button onClick={resetFilters} className="text-primary hover:underline">Reset filters</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function BoolCell({ value, inverse }: { value: boolean; inverse?: boolean }) {
  const isGood = inverse ? !value : value
  return value ? (
    <span className={`flex items-center gap-1 text-xs ${isGood ? "text-green-400" : "text-amber-400"}`}>
      <Check className="h-3.5 w-3.5" /> Yes
    </span>
  ) : (
    <span className={`flex items-center gap-1 text-xs ${isGood ? "text-green-400" : "text-muted-foreground"}`}>
      <X className="h-3.5 w-3.5" /> No
    </span>
  )
}
