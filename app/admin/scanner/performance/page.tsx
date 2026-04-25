'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { SignalRecord, PerfStats, ChartPoint } from '@/app/api/scanner/performance/route'

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

function PctCell({ val }: { val: number | null }) {
  if (val === null) return <span className="text-zinc-700">—</span>
  const color = val < 0 ? 'text-green-400' : 'text-red-400'
  return (
    <span className={`font-mono ${color}`}>
      {val > 0 ? '+' : ''}{val.toFixed(2)}%
    </span>
  )
}

const SIGNAL_LABELS: Record<string, string> = {
  far_below_200ema: '↓↓ EMA200',
  below_200ema:     '↓ EMA200',
  near_200ema:      '≈ EMA200',
  lower_highs:      'LH ✓✓',
  weak_lower_highs: 'LH ✓',
  heavy_bear_vol:   'Vol ✓✓',
  bear_vol:         'Vol ✓',
  high_funding:     'Fund ↑↑↑',
  pos_funding:      'Fund ↑↑',
  slight_funding:   'Fund ↑',
  rsi_ob:           'RSI OB',
  rsi_div:          'RSI Div',
  macd_bear:        'MACD Bear',
  macd_zero:        'MACD <0',
  d_200ema:         'D 200EMA',
  d_lh:             'D LH',
}

export default function PerformancePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [fetching,    setFetching]    = useState(false)
  const [error,       setError]       = useState('')

  const [minScore, setMinScore] = useState('5')
  const [exchange, setExchange] = useState('all')
  const [days,     setDays]     = useState('30')

  const [signals,   setSignals]   = useState<SignalRecord[]>([])
  const [stats,     setStats]     = useState<PerfStats | null>(null)
  const [chartData, setChartData] = useState<ChartPoint[]>([])

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) router.push('/admin')
      else        setAuthLoading(false)
    }).catch(() => router.push('/admin'))
  }, [router])

  const fetchData = useCallback(async () => {
    setFetching(true)
    setError('')
    try {
      const params = new URLSearchParams({ minScore, exchange, days })
      const r = await fetch(`/api/scanner/performance?${params}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed to load')
      setSignals(d.signals ?? [])
      setStats(d.stats ?? null)
      setChartData(d.chartData ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setFetching(false)
    }
  }, [minScore, exchange, days])

  useEffect(() => {
    if (!authLoading) fetchData()
  }, [authLoading, fetchData])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-600 text-sm">Checking session…</p>
      </div>
    )
  }

  const selectCls = 'px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-zinc-950 p-6 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-zinc-100 text-lg font-bold tracking-tight">Signal Performance</h1>
          <p className="text-zinc-600 text-xs mt-1">
            Historical accuracy of short signals · green = price fell (short worked) · red = price rose (short lost)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/scanner" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">← Scanner</a>
          <a href="/admin" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">← Admin</a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl">
        <span className="text-zinc-500 text-xs font-medium">Filters</span>
        <span className="text-zinc-800">·</span>

        <div className="flex items-center gap-2">
          <label className="text-zinc-600 text-xs">Score ≥</label>
          <select value={minScore} onChange={e => setMinScore(e.target.value)} className={selectCls}>
            {[5, 6, 7, 8, 9].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-zinc-600 text-xs">Exchange</label>
          <select value={exchange} onChange={e => setExchange(e.target.value)} className={selectCls}>
            <option value="all">All</option>
            <option value="okx">OKX</option>
            <option value="hyperliquid">Hyperliquid</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-zinc-600 text-xs">Days</label>
          <select value={days} onChange={e => setDays(e.target.value)} className={selectCls}>
            <option value="7">7</option>
            <option value="14">14</option>
            <option value="30">30</option>
            <option value="60">60</option>
            <option value="90">90</option>
          </select>
        </div>

        <button
          onClick={fetchData}
          disabled={fetching}
          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-blue-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          {fetching ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Total Signals</p>
            <p className="text-zinc-100 text-2xl font-bold leading-tight">{stats.total}</p>
            <p className="text-zinc-700 text-xs mt-1">{stats.withOutcome} with outcomes</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Win Rate (24h)</p>
            <p className={`text-2xl font-bold leading-tight ${
              stats.winRate >= 60 ? 'text-green-400' : stats.winRate >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.winRate}%
            </p>
            <p className="text-zinc-700 text-xs mt-1">price dropped &gt;3% within 24h</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Avg Move 24h</p>
            <p className={`text-2xl font-bold leading-tight ${stats.avgMove24h < 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.avgMove24h > 0 ? '+' : ''}{stats.avgMove24h}%
            </p>
            <p className="text-zinc-700 text-xs mt-1">avg price change at 24h mark</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Best Threshold</p>
            <p className="text-amber-300 text-sm font-bold leading-tight mt-1">{stats.bestThreshold}</p>
            <p className="text-zinc-700 text-xs mt-1">highest 24h win rate by score tier</p>
          </div>
        </div>
      )}

      {/* Rolling win rate chart */}
      {chartData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 mb-6">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-4">
            Win Rate Over Time — rolling 30-signal window
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: '#52525b', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#52525b', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#86efac' }}
                formatter={(val: number) => [`${val}%`, 'Win rate']}
              />
              <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="#4ade80"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: '#4ade80' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Signals table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {signals.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 text-sm">
            {fetching ? 'Loading signals…' : 'No signals found for selected filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-950 border-b border-zinc-800">
                  <th className="px-3 py-3 text-left text-zinc-500 uppercase tracking-widest font-normal whitespace-nowrap">Date</th>
                  <th className="px-3 py-3 text-left text-zinc-500 uppercase tracking-widest font-normal">Symbol</th>
                  <th className="px-3 py-3 text-left text-zinc-500 uppercase tracking-widest font-normal">Exch</th>
                  <th className="px-3 py-3 text-center text-zinc-500 uppercase tracking-widest font-normal">Score</th>
                  <th className="px-3 py-3 text-left text-zinc-500 uppercase tracking-widest font-normal">Signals</th>
                  <th className="px-3 py-3 text-right text-zinc-500 uppercase tracking-widest font-normal whitespace-nowrap">Entry $</th>
                  <th className="px-3 py-3 text-right text-zinc-500 uppercase tracking-widest font-normal">24h</th>
                  <th className="px-3 py-3 text-right text-zinc-500 uppercase tracking-widest font-normal">48h</th>
                  <th className="px-3 py-3 text-right text-zinc-500 uppercase tracking-widest font-normal">72h</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((sig, i) => (
                  <tr
                    key={sig.id}
                    className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors ${
                      i % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-900/50'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap">
                      {new Date(sig.scanned_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                      {' '}
                      <span className="text-zinc-700">
                        {new Date(sig.scanned_at).toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold">
                      <span className="text-zinc-100">{sig.symbol.replace('USDT', '')}</span>
                      <span className="text-zinc-700 font-normal">USDT</span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 uppercase">
                      {sig.exchange === 'hyperliquid' ? 'HL' : sig.exchange.toUpperCase()}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded border font-bold font-mono min-w-[24px] text-center ${
                        sig.score >= 7 ? 'bg-red-950 border-red-800 text-red-300'
                        : sig.score >= 5 ? 'bg-amber-950 border-amber-800 text-amber-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}>
                        {sig.score}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <div className="flex flex-wrap gap-0.5">
                        {(Array.isArray(sig.signals) ? sig.signals : []).map(s => (
                          <span
                            key={s}
                            className="inline-block px-1 py-0.5 rounded bg-zinc-800 text-zinc-600 whitespace-nowrap"
                          >
                            {SIGNAL_LABELS[s] ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 font-mono whitespace-nowrap">
                      ${fmtPrice(sig.price_at_signal)}
                    </td>
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_24h} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_48h} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_72h} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-right text-zinc-700 text-xs">
        Green = price fell (short profitable) · Red = price rose (short lost) · Win = drop &gt;3% within 24h
      </p>
    </div>
  )
}
