'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Account = {
  slug: string
  name: string
  dashboard_url: string | null
  notes: string | null
  enabled: boolean
  current_usd: number | null
  delta_usd: number | null
  last_logged_at: string | null
  referrals: number | null
  period_label: string | null
}

type Snapshot = {
  id: number
  account_slug: string
  commission_usd: string
  captured_at: string
  referrals: number | null
  period_label: string | null
  source: string
  notes: string | null
  raw_json: any
}

const ic =
  'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

const usd = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const CURRENCIES = ['USDT', 'USD', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL']

export default function AffiliateEarningsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // quick-log form
  const [logSlug, setLogSlug] = useState('')
  const [logAmount, setLogAmount] = useState('')
  const [logCurrency, setLogCurrency] = useState('USDT')
  const [logReferrals, setLogReferrals] = useState('')
  const [logPeriod, setLogPeriod] = useState('')
  const [logging, setLogging] = useState(false)

  // account add/edit
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ slug: '', name: '', dashboard_url: '', notes: '' })
  const [editSlug, setEditSlug] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Account>>({})

  // history
  const [historySlug, setHistorySlug] = useState<string | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/affiliate-earnings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setAccounts(data.accounts)
      setTotal(data.total_usd)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/admin/check-session').then((r) => {
      if (!r.ok) router.push('/admin')
    })
    load()
  }, [router, load])

  async function logEarnings() {
    setError('')
    if (!logSlug) return setError('Pick an exchange to log against')
    if (!logAmount || isNaN(Number(logAmount))) return setError('Enter a valid amount')
    setLogging(true)
    try {
      const res = await fetch('/api/admin/affiliate-earnings/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_slug: logSlug,
          amount: Number(logAmount),
          currency: logCurrency,
          referrals: logReferrals || null,
          period_label: logPeriod || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to log')
      if (data.approximated) {
        setError(`Logged, but ${logCurrency} couldn't be priced — recorded 1:1 as USD. Edit if wrong.`)
      }
      setLogAmount('')
      setLogReferrals('')
      setLogPeriod('')
      await load()
      if (historySlug === logSlug) openHistory(logSlug)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLogging(false)
    }
  }

  async function addAccount() {
    setError('')
    if (!addForm.slug || !addForm.name) return setError('Slug and name are required')
    try {
      const res = await fetch('/api/admin/affiliate-earnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowAdd(false)
      setAddForm({ slug: '', name: '', dashboard_url: '', notes: '' })
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function saveEdit(slug: string) {
    setError('')
    try {
      const res = await fetch(`/api/admin/affiliate-earnings/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditSlug(null)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function toggleEnabled(a: Account) {
    await fetch(`/api/admin/affiliate-earnings/${a.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !a.enabled }),
    })
    await load()
  }

  async function deleteAccount(slug: string) {
    if (!confirm(`Delete "${slug}" and all its logged earnings? This can't be undone.`)) return
    await fetch(`/api/admin/affiliate-earnings/${slug}`, { method: 'DELETE' })
    if (historySlug === slug) setHistorySlug(null)
    await load()
  }

  async function openHistory(slug: string) {
    if (historySlug === slug) {
      setHistorySlug(null)
      return
    }
    setHistorySlug(slug)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/admin/affiliate-earnings/snapshot?account=${slug}`)
      setHistory(await res.json())
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteSnapshot(id: number, slug: string) {
    if (!confirm('Delete this logged entry?')) return
    await fetch(`/api/admin/affiliate-earnings/snapshot?id=${id}`, { method: 'DELETE' })
    await openHistory(slug) // openHistory toggles; call twice to refresh in place
    await openHistory(slug)
    await load()
  }

  const visible = accounts.filter((a) => showInactive || a.enabled)
  const loggedCount = accounts.filter((a) => a.current_usd != null).length

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 text-sm">
          ← Admin
        </Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">Affiliate Earnings</span>
        <button
          onClick={() => {
            setShowAdd(true)
            setError('')
          }}
          className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Add Exchange
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-amber-900/30 to-zinc-900 border border-amber-800/40 rounded-xl p-5">
            <p className="text-xs text-amber-500/80 uppercase tracking-wider">Total Commission</p>
            <p className="text-3xl font-bold text-amber-300 mt-1">{usd(total)}</p>
            <p className="text-xs text-zinc-500 mt-1">latest reading per active exchange</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Exchanges Logged</p>
            <p className="text-3xl font-bold text-zinc-100 mt-1">
              {loggedCount}
              <span className="text-lg text-zinc-600"> / {accounts.length}</span>
            </p>
            <p className="text-xs text-zinc-500 mt-1">have at least one earnings entry</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Manual v1</p>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Read each dashboard's commission balance and log it below. Auto-sync scrapers come later for
              the top earners.
            </p>
          </div>
        </div>

        {/* Quick log */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Log earnings</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow min-w-[160px]">
              <label className="block text-xs text-zinc-400 mb-1">Exchange</label>
              <select value={logSlug} onChange={(e) => setLogSlug(e.target.value)} className={ic}>
                <option value="">Select…</option>
                {accounts
                  .filter((a) => a.enabled)
                  .map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="w-32">
              <label className="block text-xs text-zinc-400 mb-1">Amount</label>
              <input
                value={logAmount}
                onChange={(e) => setLogAmount(e.target.value)}
                className={ic}
                placeholder="1250.00"
                inputMode="decimal"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-zinc-400 mb-1">Currency</label>
              <select value={logCurrency} onChange={(e) => setLogCurrency(e.target.value)} className={ic}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs text-zinc-400 mb-1">Referrals</label>
              <input
                value={logReferrals}
                onChange={(e) => setLogReferrals(e.target.value)}
                className={ic}
                placeholder="opt."
                inputMode="numeric"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs text-zinc-400 mb-1">
                Period <span className="text-zinc-600">opt.</span>
              </label>
              <input
                value={logPeriod}
                onChange={(e) => setLogPeriod(e.target.value)}
                className={ic}
                placeholder="2026-06 / all-time"
              />
            </div>
            <button
              onClick={logEarnings}
              disabled={logging}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-zinc-700 text-sm font-medium"
            >
              {logging ? 'Saving…' : 'Log'}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Stablecoins record 1:1; BTC/ETH/etc. convert to USD live via CoinGecko.
          </p>
        </div>

        {/* Add account */}
        {showAdd && (
          <div className="mb-6 bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-4">Add Exchange</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Slug *</label>
                <input
                  value={addForm.slug}
                  onChange={(e) => setAddForm((f) => ({ ...f, slug: e.target.value }))}
                  className={ic}
                  placeholder="bingx"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className={ic}
                  placeholder="BingX"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Dashboard URL</label>
                <input
                  value={addForm.dashboard_url}
                  onChange={(e) => setAddForm((f) => ({ ...f, dashboard_url: e.target.value }))}
                  className={ic}
                  placeholder="https://bingx.com/affiliate/dashboard"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                <input
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  className={ic}
                  placeholder="e.g. login: kifs@…, 40% rev share"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={addAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-400">Exchanges</h3>
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500">Loading…</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Exchange</th>
                  <th className="text-right px-4 py-3">Commission</th>
                  <th className="text-right px-4 py-3">Change</th>
                  <th className="text-right px-4 py-3">Referrals</th>
                  <th className="text-left px-4 py-3">Last logged</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <Fragment key={a.slug}>
                    <tr
                      className={`border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30 ${
                        a.enabled ? '' : 'opacity-50'
                      }`}
                    >
                      {editSlug === a.slug ? (
                        <td className="px-4 py-3" colSpan={6}>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={editForm.name ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              className={ic}
                              placeholder="Name"
                            />
                            <input
                              value={editForm.dashboard_url ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, dashboard_url: e.target.value }))}
                              className={ic}
                              placeholder="Dashboard URL"
                            />
                            <input
                              value={editForm.notes ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                              className={`${ic} col-span-2`}
                              placeholder="Notes"
                            />
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => saveEdit(a.slug)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditSlug(null)}
                              className="px-3 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium text-zinc-100">{a.name}</p>
                                <p className="text-xs text-zinc-600 font-mono">{a.slug}</p>
                              </div>
                              {a.dashboard_url && (
                                <a
                                  href={a.dashboard_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:text-blue-300"
                                  title="Open dashboard"
                                >
                                  ↗
                                </a>
                              )}
                            </div>
                            {a.notes && <p className="text-xs text-zinc-600 mt-0.5">{a.notes}</p>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-zinc-100">
                            {usd(a.current_usd)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {a.delta_usd == null ? (
                              <span className="text-zinc-700">—</span>
                            ) : (
                              <span
                                className={
                                  a.delta_usd > 0
                                    ? 'text-emerald-400'
                                    : a.delta_usd < 0
                                    ? 'text-red-400'
                                    : 'text-zinc-500'
                                }
                              >
                                {a.delta_usd > 0 ? '+' : ''}
                                {usd(a.delta_usd)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-400">
                            {a.referrals ?? <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                            {a.last_logged_at ? (
                              new Date(a.last_logged_at).toLocaleDateString()
                            ) : (
                              <span className="text-zinc-700">never</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end text-xs">
                              <button
                                onClick={() => openHistory(a.slug)}
                                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
                              >
                                {historySlug === a.slug ? 'Hide' : 'History'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditSlug(a.slug)
                                  setEditForm({ name: a.name, dashboard_url: a.dashboard_url, notes: a.notes })
                                }}
                                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggleEnabled(a)}
                                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
                              >
                                {a.enabled ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => deleteAccount(a.slug)}
                                className="px-2 py-1 bg-red-900/40 text-red-400 border border-red-800/60 rounded hover:bg-red-900/70"
                              >
                                Del
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {historySlug === a.slug && (
                      <tr key={`${a.slug}-history`} className="bg-zinc-950/60">
                        <td colSpan={6} className="px-4 py-3">
                          {historyLoading ? (
                            <p className="text-xs text-zinc-500">Loading history…</p>
                          ) : history.length === 0 ? (
                            <p className="text-xs text-zinc-600">No entries logged yet.</p>
                          ) : (
                            <div className="space-y-1">
                              {history.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-4 text-xs text-zinc-400 border-b border-zinc-800/60 last:border-0 py-1"
                                >
                                  <span className="text-zinc-500 w-28">
                                    {new Date(s.captured_at).toLocaleString()}
                                  </span>
                                  <span className="text-zinc-100 font-semibold w-24 text-right">
                                    {usd(Number(s.commission_usd))}
                                  </span>
                                  <span className="w-28 text-zinc-500">
                                    {s.raw_json?.currency && s.raw_json.currency !== 'USD'
                                      ? `${s.raw_json.amount} ${s.raw_json.currency}`
                                      : ''}
                                    {s.raw_json?.approximated ? ' (≈)' : ''}
                                  </span>
                                  <span className="w-20">{s.referrals != null ? `${s.referrals} refs` : ''}</span>
                                  <span className="grow text-zinc-600">{s.period_label ?? ''}</span>
                                  <button
                                    onClick={() => deleteSnapshot(s.id, a.slug)}
                                    className="text-red-500/70 hover:text-red-400"
                                  >
                                    delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
