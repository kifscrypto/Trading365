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
  adjusted_score: number | null
  fng: number | null
  btc_dominance: number | null
  btc_funding: number | null
  btc_dom_trend: string | null
  market_condition: 'favourable' | 'neutral' | 'hostile' | null
  sentiment_flags: string[] | null
}

interface SentimentSummary {
  fng: number
  btcDominance: number
  domTrend: 'up' | 'down' | 'flat'
  btcFunding: number
  marketCondition: 'favourable' | 'neutral' | 'hostile'
  sentimentFlags: string[]
}

const SIGNAL_LABELS: Record<string, string> = {
  // EMA (ema_-X% signals fall through and display as-is)
  far_below_200ema: '↓↓ EMA200',
  below_200ema:     '↓ EMA200',
  near_200ema:      '≈ EMA200',
  // Structure
  lower_highs:      'LH ✓✓',
  weak_lower_highs: 'LH ✓',
  // Volume
  heavy_bear_vol:   'Vol Bear ✓✓',
  bear_vol:         'Vol Bear ✓',
  // Funding
  high_funding:     'Fund ↑↑↑',
  pos_funding:      'Fund ↑↑',
  slight_funding:   'Fund ↑',
  // RSI
  rsi_ob:           'RSI OB',
  rsi_div:          'RSI Div',
  // MACD
  macd_bear:        'MACD Bear',
  macd_zero:        'MACD <0',
  // Daily
  d_200ema:         'D 200EMA',
  d_lh:             'D LH',
}

const SENTIMENT_FLAG_LABELS: Record<string, { label: string; type: 'fav' | 'hos' }> = {
  extreme_greed:   { label: 'F&G extreme greed (≥75) — longs over-leveraged',         type: 'fav' },
  greed:           { label: 'F&G greed (≥60) — elevated long positioning',              type: 'fav' },
  extreme_fear:    { label: 'F&G extreme fear (≤20) — panic selling, late to short',   type: 'hos' },
  fear:            { label: 'F&G fear (≤35) — crowd defensive, low conviction',         type: 'hos' },
  btc_high_longs:  { label: 'BTC funding >0.03%/8h — longs dangerously over-extended', type: 'fav' },
  btc_pos_funding: { label: 'BTC funding positive — longs paying shorts',               type: 'fav' },
  btc_crowd_short: { label: 'BTC funding negative — crowd already short, squeeze risk', type: 'hos' },
  btc_bearish:     { label: 'BTC structure bearish — below 50EMA + lower highs',        type: 'fav' },
  btc_bullish:     { label: 'BTC structure bullish — above 50EMA, alts may recover',    type: 'hos' },
  dom_rising:      { label: 'BTC dominance rising — capital rotating from alts to BTC', type: 'fav' },
  dom_falling:     { label: 'BTC dominance falling — alts gaining vs BTC',              type: 'hos' },
}

function fmtPrice(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

function fmtOI(v: number): string {
  if (!v) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  return `$${(v / 1e6).toFixed(1)}M`
}

function timeAgoStr(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (diff < 10)   return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function ScoreBadge({ score, raw }: { score: number; raw: number }) {
  let cls = 'bg-zinc-800 border-zinc-700 text-zinc-400'
  if (score >= 7)      cls = 'bg-red-950 border-red-800 text-red-300'
  else if (score >= 5) cls = 'bg-amber-950 border-amber-800 text-amber-300'
  else if (score >= 3) cls = 'bg-yellow-950 border-yellow-800 text-yellow-300'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block px-2.5 py-0.5 rounded border text-xs font-bold font-mono min-w-[28px] text-center ${cls}`}>
        {score}
      </span>
      {score !== raw && (
        <span className="text-zinc-700 text-xs font-mono">({raw})</span>
      )}
    </span>
  )
}

function SentimentBar({ s }: { s: SentimentSummary }) {
  const [showFlags, setShowFlags] = useState(false)

  const fngColor = s.fng >= 75 ? 'text-red-400'
                 : s.fng >= 60 ? 'text-amber-400'
                 : s.fng <= 25 ? 'text-green-400'
                 : s.fng <= 40 ? 'text-emerald-400'
                 : 'text-zinc-400'

  const fngLabel = s.fng >= 75 ? 'Extreme Greed'
                 : s.fng >= 60 ? 'Greed'
                 : s.fng >= 40 ? 'Neutral'
                 : s.fng >= 25 ? 'Fear'
                 : 'Extreme Fear'

  const domArrow = s.domTrend === 'up' ? '↑' : s.domTrend === 'down' ? '↓' : '→'
  const domColor = s.domTrend === 'up' ? 'text-amber-400' : s.domTrend === 'down' ? 'text-zinc-500' : 'text-zinc-600'

  const mcColor = s.marketCondition === 'hostile'
    ? 'bg-red-950 border-red-800 text-red-300 hover:bg-red-900'
    : s.marketCondition === 'favourable'
    ? 'bg-green-950 border-green-800 text-green-300 hover:bg-green-900'
    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono">
        <span className="text-zinc-500 font-medium">BTC Sentiment</span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="text-zinc-600">F&G </span>
          <span className={fngColor}>{s.fng}</span>
          <span className="text-zinc-600 ml-1">({fngLabel})</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="text-zinc-600">Dom </span>
          <span className={domColor}>{(s.btcDominance ?? 0).toFixed(1)}% {domArrow}</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="text-zinc-600">BTC Fund </span>
          <span className={s.btcFunding > 0 ? 'text-red-400' : s.btcFunding < 0 ? 'text-green-400' : 'text-zinc-500'}>
            {(s.btcFunding ?? 0) > 0 ? '+' : ''}{((s.btcFunding ?? 0) * 100).toFixed(4)}%
          </span>
        </span>
        <span className="text-zinc-700">·</span>
        <button
          onClick={() => setShowFlags(v => !v)}
          title="Click to see why"
          className={`px-2 py-0.5 rounded border text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer ${mcColor}`}
        >
          {s.marketCondition} {showFlags ? '▴' : '▾'}
        </button>
      </div>

      {showFlags && (
        <div className="mt-1 px-4 py-3 bg-zinc-900/80 border border-zinc-800 border-t-0 rounded-b-xl text-xs font-mono space-y-2">
          <p className="text-zinc-600 uppercase tracking-widest text-[10px] mb-1">Why {s.marketCondition}</p>
          {s.sentimentFlags.length === 0 ? (
            <p className="text-zinc-600">No signals fired — neutral by default.</p>
          ) : (
            s.sentimentFlags.map(flag => {
              const meta = SENTIMENT_FLAG_LABELS[flag]
              const isFav = meta?.type === 'fav'
              return (
                <div key={flag} className="flex items-start gap-2">
                  <span className={isFav ? 'text-green-500' : 'text-red-500'}>
                    {isFav ? '↑' : '↓'}
                  </span>
                  <span className={isFav ? 'text-zinc-300' : 'text-zinc-400'}>
                    {meta?.label ?? flag}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function ScannerPage() {
  const router = useRouter()
  const [exchange,  setExchange]  = useState('okx')
  const [results,   setResults]   = useState<ScanResult[]>([])
  const [sentiment, setSentiment] = useState<SentimentSummary | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [scanning,  setScanning]  = useState(false)
  const [error,     setError]     = useState('')
  const [cached,    setCached]    = useState(false)
  const [scanTime,  setScanTime]  = useState<string | null>(null)
  const [timeAgo,   setTimeAgo]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) router.push('/admin')
      else        setLoading(false)
    }).catch(() => router.push('/admin'))
  }, [router])

  // Live "X ago" counter
  useEffect(() => {
    if (!scanTime) { setTimeAgo(null); return }
    const tick = () => setTimeAgo(timeAgoStr(scanTime))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [scanTime])

  const fetchResults = useCallback(async (refresh = false) => {
    setScanning(true)
    setError('')
    try {
      const r = await fetch(`/api/scanner?exchange=${exchange}${refresh ? '&refresh=1' : ''}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail ? `${d.error ?? 'Scan failed'}: ${d.detail}` : (d.error ?? 'Scan failed'))
      setResults(d.results ?? [])
      setSentiment(d.sentiment ?? null)
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
            {timeAgo
              ? <>{cached ? '⚡ cached' : '🔄 live'} · scanned <span className="text-zinc-500">{timeAgo}</span></>
              : 'EMA200 (3pt) · lower highs (2pt) · bear vol (2pt) · funding (3pt) · BTC sentiment adj'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 bg-zinc-900 rounded-lg p-1">
            {(['okx', 'hyperliquid', 'mexc'] as const).map(ex => (
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

          <button
            disabled={scanning}
            onClick={() => !scanning && fetchResults(true)}
            className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs text-blue-400 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? '⏳ Scanning (20–30s)…' : '↻ Refresh'}
          </button>

          <a
            href="/admin/scanner/performance"
            className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Performance →
          </a>

          <a href="/admin" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
            ← Admin
          </a>
        </div>
      </div>

      {/* Hostile banner */}
      {sentiment?.marketCondition === 'hostile' && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs font-mono">
          ⚠ BTC sentiment hostile — short conviction reduced. Scores adjusted.
        </div>
      )}

      {/* Sentiment bar */}
      {sentiment && <SentimentBar s={sentiment} />}

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
        <span className="text-zinc-700 text-xs self-center">· score = adj · (raw)</span>
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
                {results.map((r, i) => {
                  const displayScore = r.adjusted_score ?? r.score
                  return (
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
                      <td className={`px-4 py-3 text-sm font-mono ${(r.funding_pct ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {(r.funding_pct ?? 0) > 0 ? '+' : ''}{(r.funding_pct ?? 0).toFixed(4)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge score={displayScore} raw={r.score} />
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-right text-zinc-700 text-xs">
        Cached 5 min · OI filter &gt;$50M · {
          exchange === 'hyperliquid' ? 'funding normalised to 8h' :
          exchange === 'mexc'        ? 'MEXC USDT perps' :
          'OKX USDT perps'
        } · BTC sentiment adjusted
      </p>
    </div>
  )
}
