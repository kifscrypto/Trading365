"use client"

import { useState } from "react"
import { exchanges } from "@/lib/data/exchanges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Check, X, ExternalLink, ArrowRight, RotateCcw } from "lucide-react"

export function CompareClient() {
  const [exchange1Slug, setExchange1Slug] = useState<string>("")
  const [exchange2Slug, setExchange2Slug] = useState<string>("")

  const ex1 = exchanges.find((e) => e.slug === exchange1Slug)
  const ex2 = exchanges.find((e) => e.slug === exchange2Slug)

  const hasSelection = ex1 && ex2
  const isSame = exchange1Slug === exchange2Slug && exchange1Slug !== ""

  function resetSelections() {
    setExchange1Slug("")
    setExchange2Slug("")
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <Breadcrumbs items={[{ label: "Compare Exchanges" }]} />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
            Exchange Comparison Tool
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Select any two exchanges below to see a detailed side-by-side breakdown of fees, leverage,
            KYC requirements, bonuses, and more.
          </p>
        </div>
      </section>

      {/* Selectors */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
          <div className="w-full md:flex-1">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Exchange 1
            </label>
            <Select value={exchange1Slug} onValueChange={setExchange1Slug}>
              <SelectTrigger className="w-full bg-card border-border h-12 text-base">
                <SelectValue placeholder="Select an exchange..." />
              </SelectTrigger>
              <SelectContent>
                {exchanges.map((ex) => (
                  <SelectItem key={ex.slug} value={ex.slug}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground mt-5">
            <span className="text-sm font-bold">VS</span>
          </div>

          <div className="w-full md:flex-1">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Exchange 2
            </label>
            <Select value={exchange2Slug} onValueChange={setExchange2Slug}>
              <SelectTrigger className="w-full bg-card border-border h-12 text-base">
                <SelectValue placeholder="Select an exchange..." />
              </SelectTrigger>
              <SelectContent>
                {exchanges.map((ex) => (
                  <SelectItem key={ex.slug} value={ex.slug}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(exchange1Slug || exchange2Slug) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={resetSelections}
              className="mt-5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Reset selections"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isSame && (
          <p className="mt-4 text-center text-sm text-destructive">
            Please select two different exchanges to compare.
          </p>
        )}
      </section>

      {/* Comparison Table */}
      {hasSelection && !isSame && (
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="overflow-hidden rounded-xl border border-border">
            {/* Header Row */}
            <div className="grid grid-cols-3 border-b border-border bg-secondary/50">
              <div className="p-4 text-sm font-medium text-muted-foreground">Feature</div>
              <div className="border-l border-border p-4 text-center">
                <span className="text-lg font-bold text-foreground">{ex1.name}</span>
                <div className="mt-1">
                  <Badge variant="outline" className="border-primary/40 text-primary font-mono text-xs">
                    {ex1.rating}/10
                  </Badge>
                </div>
              </div>
              <div className="border-l border-border p-4 text-center">
                <span className="text-lg font-bold text-foreground">{ex2.name}</span>
                <div className="mt-1">
                  <Badge variant="outline" className="border-primary/40 text-primary font-mono text-xs">
                    {ex2.rating}/10
                  </Badge>
                </div>
              </div>
            </div>

            {/* Data Rows */}
            {[
              {
                label: "Maker Fee",
                v1: ex1.fees.maker,
                v2: ex2.fees.maker,
                highlight: "lower",
              },
              {
                label: "Taker Fee",
                v1: ex1.fees.taker,
                v2: ex2.fees.taker,
                highlight: "lower",
              },
              {
                label: "KYC Required",
                v1: ex1.kyc,
                v2: ex2.kyc,
                type: "boolean-inverse" as const,
              },
              {
                label: "KYC Details",
                v1: ex1.kycNote || "N/A",
                v2: ex2.kycNote || "N/A",
              },
              {
                label: "Max Leverage",
                v1: ex1.leverage || "N/A",
                v2: ex2.leverage || "N/A",
                highlight: "higher",
              },
              {
                label: "Trading Pairs",
                v1: ex1.tradingPairs.toString(),
                v2: ex2.tradingPairs.toString(),
                highlight: "higher-num",
              },
              {
                label: "Sign-Up Bonus",
                v1: ex1.bonus,
                v2: ex2.bonus,
              },
              {
                label: "Min Deposit",
                v1: ex1.minDeposit,
                v2: ex2.minDeposit,
              },
              {
                label: "Withdrawal Speed",
                v1: ex1.withdrawalSpeed,
                v2: ex2.withdrawalSpeed,
              },
              {
                label: "Copy Trading",
                v1: ex1.copyTrading ?? false,
                v2: ex2.copyTrading ?? false,
                type: "boolean" as const,
              },
              {
                label: "VIP Program",
                v1: ex1.vipProgram ?? false,
                v2: ex2.vipProgram ?? false,
                type: "boolean" as const,
              },
              {
                label: "Founded",
                v1: ex1.founded,
                v2: ex2.founded,
              },
              {
                label: "Headquarters",
                v1: ex1.headquarters,
                v2: ex2.headquarters,
              },
            ].map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-3 ${i % 2 === 0 ? "bg-card" : "bg-secondary/20"} ${
                  i < 12 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex items-center p-4 text-sm font-medium text-muted-foreground">
                  {row.label}
                </div>
                <div className="flex items-center justify-center border-l border-border p-4 text-sm text-foreground">
                  {renderCell(row.v1, row.type)}
                </div>
                <div className="flex items-center justify-center border-l border-border p-4 text-sm text-foreground">
                  {renderCell(row.v2, row.type)}
                </div>
              </div>
            ))}

            {/* Security Row */}
            <div className="grid grid-cols-3 border-t border-border bg-card">
              <div className="flex items-center p-4 text-sm font-medium text-muted-foreground">
                Security Features
              </div>
              <div className="border-l border-border p-4">
                <div className="flex flex-wrap justify-center gap-1">
                  {ex1.securityFeatures.map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="border-l border-border p-4">
                <div className="flex flex-wrap justify-center gap-1">
                  {ex2.securityFeatures.map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Pros Row */}
            <div className="grid grid-cols-3 border-t border-border bg-secondary/20">
              <div className="flex items-start p-4 text-sm font-medium text-muted-foreground">
                Pros
              </div>
              <div className="border-l border-border p-4">
                <ul className="space-y-1.5">
                  {ex1.pros.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-l border-border p-4">
                <ul className="space-y-1.5">
                  {ex2.pros.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Cons Row */}
            <div className="grid grid-cols-3 border-t border-border bg-card">
              <div className="flex items-start p-4 text-sm font-medium text-muted-foreground">
                Cons
              </div>
              <div className="border-l border-border p-4">
                <ul className="space-y-1.5">
                  {ex1.cons.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-xs text-foreground">
                      <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-l border-border p-4">
                <ul className="space-y-1.5">
                  {ex2.cons.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-xs text-foreground">
                      <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <a
              href={ex1.referralLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-center font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign Up for {ex1.name}
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={ex2.referralLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-center font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign Up for {ex2.name}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* Read Full Reviews */}
          <div className="mt-6 flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-6">
            <a
              href={ex1.fullReview}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Read full {ex1.name} review <ArrowRight className="h-3 w-3" />
            </a>
            <a
              href={ex2.fullReview}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Read full {ex2.name} review <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!hasSelection && !isSame && (
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="rounded-xl border border-dashed border-border bg-secondary/10 p-12 text-center">
            <p className="text-lg text-muted-foreground">
              Select two exchanges above to see a detailed comparison
            </p>
            <p className="mt-2 text-sm text-muted-foreground/60">
              Compare fees, leverage, KYC requirements, bonuses, and more
            </p>
          </div>

          {/* Quick Comparison Suggestions */}
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Popular Comparisons</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                { a: "weex", b: "bydfi", label: "WEEX vs BYDFi" },
                { a: "weex", b: "blofin", label: "WEEX vs BloFin" },
                { a: "bitunix", b: "kcex", label: "Bitunix vs KCEX" },
              ].map((pair) => (
                <button
                  key={pair.label}
                  onClick={() => {
                    setExchange1Slug(pair.a)
                    setExchange2Slug(pair.b)
                  }}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50"
                >
                  <span className="text-sm font-medium text-foreground">{pair.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function renderCell(value: string | boolean, type?: string) {
  if (type === "boolean" || type === "boolean-inverse") {
    const isGood = type === "boolean-inverse" ? !value : value
    return value ? (
      <span className={`flex items-center gap-1 ${type === "boolean-inverse" ? "text-red-400" : "text-green-400"}`}>
        <Check className="h-4 w-4" /> Yes
      </span>
    ) : (
      <span className={`flex items-center gap-1 ${type === "boolean-inverse" ? "text-green-400" : "text-muted-foreground"}`}>
        <X className="h-4 w-4" /> No
      </span>
    )
  }
  return <span>{String(value)}</span>
}
