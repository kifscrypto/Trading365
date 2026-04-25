'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ScanResult {
  symbol: string
  price: number
  oi_usd: number
  funding_pct: number
  score: number
  signals: string[] | null
  exchange: string
  scanned_at: string
}

const SIGNAL_LABELS: Record<string, string> = {
  far_below_200ema: '↓↓ EMA200',
  below_200ema:     '↓ EMA200',
  near_200ema:      '≈ EMA200',
  lower_highs:      'LH ✓✓',
  weak_lower_highs: 'LH ✓',
  heavy_bear_vol:   'Vol Bear ✓✓',
  bear_vol:         'Vol Bear ✓',
  high_funding:     'Fund ↑↑↑',
  pos_funding:      'Fund ↑↑',
  slight_funding:   'Fund ↑',
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

function fmtOI(v: number): string {
  if (!v) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  return `$${(v / 1e6).toFixed(1)}M`
}

function ScoreBadge({ score }: { score: number }) {
  let cls = 'bg-zinc-800 border-zinc-700 text-zinc-400'
  if (score >= 7)      cls = 'bg-red-950 border-red-800 text-red-300'
  else if (score >= 5) cls = 'bg-amber-950 border-amber-800 text-amber-300'
  else if (score >= 3) cls = 'bg-yellow-950 border-yellow-800 text-yellow-300'

  return (
    <span className={`inline-block px-2.5 py-0.5 rounded border text-xs font-bold font-mono min-w-[28px] text-center ${cls}`}>
      {score}
    </span>
  )
}

export default function ScannerPage() {
  const router = useRouter()
  const [exchange, setExchange] = useState('okx')
  const [results,  setResults]  = useState<ScanResult[]>([])
  const [loading,  setLoading]  = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error,    setError]    = useState('')
  const [cached,   setCached]   = useState(false)
  const [scanTime, setScanTime] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) router.push('/admin')
      else        setLoading(false)
    }).catch(() => router.push('/admin'))
  }, [router])

  const fetchResults = useCallback(async (refresh = false) => {
    setScanning(true)
    setError('')
    try {
      const r = await fetch(`/api/scanner?exchange=${exchange}${refresh ? '&refresh=1' : ''}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Scan failed')
      setResults(d.results ?? [])
      setCached(!!d.cached)
      if (d.results?.length) setScanTime(d.results[0].scanned_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setScanning(false)
    }
  }, [exchange])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-600 text-sm">Checking session…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-zinc-100 text-lg font-bold tracking-tight">Altcoin Short Scanner</h1>
          <p className="text-zinc-600 text-xs mt-1">
            {scanTime
              ? `${cached ? '⚡ cached' : '🔄 live'} · ${new Date(scanTime).toLocaleTimeString()}`
              : 'EMA200 (3pt) · lower highs (2pt) · bear vol (2pt) · funding (3pt)'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Exchange tabs */}
          <div className="flex gap-0.5 bg-zinc-900 rounded-lg p-1">
            {(['okx', 'binance'] as const).map(ex => (
              <button
                key={ex}
                onClick={() => setExchange(ex)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  exchange === ex
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {ex.charAt(0).toUpperCase() + ex.slice(1)}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            disabled={scanning}
            onClick={() => !scanning && fetchResults(true)}
            className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs text-blue-400 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? '⏳ Scanning (20–30s)…' : '↻ Refresh'}
          </button>

          <a href="/admin" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
            ← Admin
          </a>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-5">
        {[
          { label: '7–10  Strong short', cls: 'bg-red-950 border-red-800' },
          { label: '5–6    Moderate',    cls: 'bg-amber-950 border-amber-800' },
          { label: '3–4    Weak',        cls: 'bg-yellow-950 border-yellow-800' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm border ${cls}`} />
            <span className="text-zinc-500 text-xs">{label}</span>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {results.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 text-sm space-y-1">
            <p>No results yet.</p>
            <p>Click <span className="text-blue-400 font-medium">↻ Refresh</span> to scan — takes 20–30 seconds.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-950 border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest w-9">#</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest">Price</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest">OI</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest">Funding</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 uppercase tracking-widest">Score</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 uppercase tracking-widest">Signals</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={r.symbol}
                    className={`border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors ${
                      i % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-900/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-zinc-600 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-sm tracking-wide">
                      <span className="text-zinc-100">{r.symbol.replace('USDT', '')}</span>
                      <span className="text-zinc-700 font-normal">USDT</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">${fmtPrice(r.price)}</td>
                    <td className="px-4 py-3 text-zinc-400 text-sm">{fmtOI(r.oi_usd)}</td>
                    <td className={`px-4 py-3 text-sm font-mono ${r.funding_pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {r.funding_pct > 0 ? '+' : ''}{r.funding_pct.toFixed(4)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge score={r.score} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(r.signals) ? r.signals : []).map(s => (
                          <span
                            key={s}
                            className="inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-xs whitespace-nowrap"
                          >
                            {SIGNAL_LABELS[s] ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-right text-zinc-700 text-xs">
        Cached 5 min · {exchange === 'okx' ? 'OI filter >$15M' : 'Volume filter >$50M 24h'}
      </p>
    </div>
  )
}
