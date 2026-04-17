"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchResult {
  slug: string
  title: string
  category: string
  excerpt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Review",
  comparisons: "Comparison",
  "no-kyc": "No-KYC",
  bonuses: "Bonus",
  guides: "Guide",
  audits: "Audit",
}

export function SiteSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      setResults(await res.json())
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === "Escape") { setOpen(false); setQuery(""); setResults([]) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery(""); setResults([])
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function navigate(result: SearchResult) {
    router.push(`/${result.category}/${result.slug}`)
    setOpen(false); setQuery(""); setResults([])
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === "Enter" && active >= 0) navigate(results[active])
  }

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-zinc-900 px-3 py-1.5 w-56">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(-1) }}
            onKeyDown={onKeyDown}
            placeholder="Search articles…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]) }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {open && (results.length > 0 || loading) && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-xl border border-border bg-zinc-900 shadow-xl overflow-hidden">
          {loading && !results.length ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li key={r.slug}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => navigate(r)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors border-b border-border last:border-0",
                      active === i ? "bg-zinc-800" : "hover:bg-zinc-800"
                    )}
                  >
                    <span className="text-sm font-medium text-foreground leading-snug line-clamp-1">{r.title}</span>
                    <span className="text-xs text-primary">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-xl border border-border bg-zinc-900 shadow-xl px-4 py-3">
          <p className="text-sm text-muted-foreground">No results for "<span className="text-foreground">{query}</span>"</p>
        </div>
      )}
    </div>
  )
}
