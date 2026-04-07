"use client"

import { useState, useMemo } from "react"
import { exchanges } from "@/lib/data/exchanges"
import type { Exchange } from "@/lib/data/types"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import {
  Check, X, ExternalLink, ArrowRight, ChevronUp, ChevronDown,
  SlidersHorizontal, RotateCcw,
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

  // Selection for detail comparison
  const [selected, setSelected] = useState<string[]>([])
  const [showDetail, setShowDetail] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "fees.maker" ? "asc" : "desc")
    }
  }

  function toggleSelect(slug: string) {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length < 3
        ? [...prev, slug]
        : prev
    )
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

  const selectedExchanges = selected.map((s) => exchanges.find((e) => e.slug === s)!).filter(Boolean)
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
            Filter, sort, and compare crypto exchanges side-by-side on fees, leverage, KYC, bonuses, copy trading, and more. Select up to 3 exchanges to compare in detail.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* KYC */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
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

            {/* Country */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
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

            {/* Toggle filters */}
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
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-8">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Exchange</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("rating")}>
                  <div className="flex items-center gap-1">Rating <SortIcon k="rating" /></div>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("fees.maker")}>
                  <div className="flex items-center gap-1">Maker Fee <SortIcon k="fees.maker" /></div>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("leverage")}>
                  <div className="flex items-center gap-1">Leverage <SortIcon k="leverage" /></div>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("bonusAmount")}>
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
                const isSelected = selected.includes(e.slug)
                return (
                  <tr
                    key={e.slug}
                    className={`transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleSelect(e.slug)}
                        disabled={!isSelected && selected.length >= 3}
                        className={`h-5 w-5 rounded border-2 transition-colors flex items-center justify-center ${
                          isSelected
                            ? "border-primary bg-primary"
                            : selected.length >= 3
                            ? "border-border opacity-30 cursor-not-allowed"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{e.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-primary font-bold">{e.rating}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">{e.fees.maker}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{e.leverage ?? "—"}</td>
                    <td className="px-4 py-3">
                      {e.kyc ? (
                        <span className="flex items-center gap-1 text-amber-400 text-xs">
                          <Check className="h-3 w-3" /> Required
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-400 text-xs">
                          <X className="h-3 w-3" /> Not required
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{e.bonus}</td>
                    <td className="px-4 py-3">
                      <BoolCell value={!!e.copyTrading} />
                    </td>
                    <td className="px-4 py-3">
                      <BoolCell value={e.debitCard} />
                    </td>
                    <td className="px-4 py-3">
                      <BoolCell value={e.fiatDeposit} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5 flex-wrap">
                        {COUNTRIES.map((c) => (
                          <span
                            key={c}
                            className={`text-[10px] rounded px-1 py-0.5 font-mono ${
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
                      <a
                        href={e.fullReview}
                        className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Review <ArrowRight className="h-3 w-3" />
                      </a>
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

        {/* Selection bar */}
        {selected.length > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Comparing:</span>
              {selectedExchanges.map((e) => (
                <Badge key={e.slug} variant="outline" className="border-primary/40 text-primary">
                  {e.name}
                  <button
                    onClick={() => toggleSelect(e.slug)}
                    className="ml-1.5 opacity-60 hover:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              {selected.length < 3 && (
                <span className="text-xs text-muted-foreground">
                  (select {3 - selected.length} more for full comparison)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setShowDetail(true)}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Compare in Detail →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Detail Comparison */}
      {showDetail && selectedExchanges.length >= 2 && (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Detailed Comparison</h2>
            <button onClick={() => setShowDetail(false)} className="text-sm text-muted-foreground hover:text-foreground">
              ✕ Close
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            {/* Header */}
            <div className={`grid border-b border-border bg-secondary/50`} style={{ gridTemplateColumns: `200px repeat(${selectedExchanges.length}, 1fr)` }}>
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

            {/* Rows */}
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

            {/* Countries row */}
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

          {/* CTAs */}
          <div className={`mt-6 grid gap-4`} style={{ gridTemplateColumns: `repeat(${selectedExchanges.length}, 1fr)` }}>
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
          <div className={`mt-4 grid gap-4`} style={{ gridTemplateColumns: `repeat(${selectedExchanges.length}, 1fr)` }}>
            {selectedExchanges.map((e) => (
              <a
                key={e.slug}
                href={e.fullReview}
                className="flex items-center justify-center gap-1 text-sm text-primary hover:underline"
              >
                Full {e.name} review <ArrowRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        </section>
      )}
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
