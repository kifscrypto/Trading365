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

function PctCell({ val, direction }: { val: number | null; direction: string }) {
  if (val === null) return <span className="text-zinc-700">—</span>
  // Win = green: shorts win when price falls (val < 0), longs when it rises (val > 0).
  const win = direction === 'long' ? val > 0 : val < 0
  const color = win ? 'text-green-400' : 'text-red-400'
  return (
    <span className={`font-mono ${color}`}>
      {val > 0 ? '+' : ''}{val.toFixed(2)}%
    </span>
  )
}

const marketClass: Record<string, string> = {
  favourable: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  neutral:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  hostile:    'bg-red-500/10 text-red-400 border-red-500/30',
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
  macd_1h_cross:    'MACD 1H ✗',
  rsi_1h_falling:   'RSI 1H ↓',
  bearish_engulf:   'Bear Engulf',
  // long signal keys
  above_200ema:      '>200EMA',
  above_50ema:       '>50EMA',
  golden_cross:      'Golden X',
  macd_bull:         'MACD Bull',
  macd_hist_pos:     'MACD Hist+',
  rsi_building:      'RSI Build',
  vol_above_avg:     'Vol ✓',
  vol_rising_up:     'Vol Rising',
  higher_lows:       'HL',
  higher_highs:      'HH',
  ema50_tight:       'EMA50 ✓✓',
  ema50_near:        'EMA50 ✓',
  funding_squeeze:   'Fund Sqz',
  funding_low:       'Fund Low',
  d_above_200ema:    'D >200EMA',
  d_higher_lows:     'D HL',
  rsi_bull_div:      'RSI Div',
  macd_1h_cross_bull:'MACD 1H ✓',
  rsi_1h_rising:     'RSI 1H ↑',
  bullish_engulf:    'Bull Engulf',
}

type Direction = 'short' | 'long' | 'both'

const DIRECTION_LABELS: Record<Direction, string> = {
  short: 'fired vs suppressed (favourable only)',
  long:  'fired vs suppressed (hostile only)',
  both:  'fired vs suppressed (regime-gated)',
}

export default function PerformancePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [fetching,    setFetching]    = useState(false)
  const [error,       setError]       = useState('')

  const [minScore,  setMinScore]  = useState('7')
  const [exchange,  setExchange]  = useState('all')
  const [days,      setDays]      = useState('30')
  const [direction, setDirection] = useState<Direction>('both')

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
      const params = new URLSearchParams({ minScore, exchange, days, direction })
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
  }, [minScore, exchange, days, direction])

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
            {direction === 'long'
              ? 'Historical accuracy of long signals · green = price rose (long worked) · red = price fell (long lost)'
              : direction === 'short'
              ? 'Historical accuracy of short signals · green = price fell (short worked) · red = price rose (short lost)'
              : 'Historical accuracy of short + long signals · green = move in the signal’s favour · red = against'}
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
          <label className="text-zinc-600 text-xs">Direction</label>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            {([['short', '🔴 Short'], ['long', '🟢 Long'], ['both', 'Both']] as [Direction, string][]).map(([d, lbl]) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  direction === d ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

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
            <option value="mexc">MEXC</option>
            <option value="weex">WEEX</option>
            <option value="bitunix">Bitunix</option>
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Total Signals</p>
            <p className="text-zinc-100 text-2xl font-bold leading-tight">{stats.total}</p>
            <p className="text-zinc-700 text-xs mt-1">{stats.withOutcome} with outcomes</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Win Rate · TP1 (1.5%)</p>
            <p className={`text-2xl font-bold leading-tight ${
              stats.winRate >= 60 ? 'text-green-400' : stats.winRate >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.winRate}%
            </p>
            <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                TP1 <span className="text-green-400">{stats.tp1Rate}%</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                TP2 <span className="text-green-400">{stats.tp2Rate}%</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                TP3 <span className="text-green-400">{stats.tp3Rate}%</span>
              </span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Avg Move 24h</p>
            <p className={`text-2xl font-bold leading-tight ${
              direction === 'both' ? 'text-zinc-300'
              : (direction === 'long' ? stats.avgMove24h > 0 : stats.avgMove24h < 0) ? 'text-green-400' : 'text-red-400'
            }`}>
              {stats.avgMove24h > 0 ? '+' : ''}{stats.avgMove24h}%
            </p>
            <p className="text-zinc-700 text-xs mt-1">avg price change at 24h mark</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Best Threshold</p>
            <p className="text-amber-300 text-sm font-bold leading-tight mt-1">{stats.bestThreshold}</p>
            <p className="text-zinc-700 text-xs mt-1">highest TP1 win rate by score tier</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Regime Filter</p>
            <p className="text-2xl font-bold leading-tight">
              <span className="text-green-400">{stats.regimeFired}</span>
              <span className="text-zinc-600 text-lg"> / </span>
              <span className="text-red-400">{stats.regimeSuppressed}</span>
            </p>
            <p className="text-zinc-700 text-xs mt-1">{DIRECTION_LABELS[direction]}</p>
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
                  <th className="px-3 py-3 text-center text-zinc-500 uppercase tracking-widest font-normal">Dir</th>
                  <th className="px-3 py-3 text-center text-zinc-500 uppercase tracking-widest font-normal">Score</th>
                  <th className="px-3 py-3 text-center text-zinc-500 uppercase tracking-widest font-normal">Market</th>
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
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap ${
                        sig.direction === 'long'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        {sig.direction === 'long' ? '🟢 LONG' : '🔴 SHORT'}
                      </span>
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
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${marketClass[sig.market_condition] ?? 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                        {sig.market_condition}
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
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_24h} direction={sig.direction} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_48h} direction={sig.direction} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell val={sig.outcome_72h} direction={sig.direction} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-right text-zinc-700 text-xs">
        {direction === 'long'
          ? 'Green = price rose (long profitable) · Red = price fell · Win = rise ≥1.5% within 24h (TP1)'
          : direction === 'short'
          ? 'Green = price fell (short profitable) · Red = price rose · Win = drop ≥1.5% within 24h (TP1)'
          : 'Green = move in the signal’s favour · Red = against · Win = ≥1.5% favourable move within 24h (TP1)'}
      </p>
    </div>
  )
}
