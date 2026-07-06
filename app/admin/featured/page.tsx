'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Opt { slug: string; name: string; category?: string }
interface Meta { slot: string; label: string; kind: 'exchange' | 'article'; help: string }

const BTN_SM = 'px-2 py-1 text-xs rounded font-medium transition-colors'

export default function FeaturedAdmin() {
  const [meta, setMeta] = useState<Meta[]>([])
  const [slots, setSlots] = useState<Record<string, string[]>>({})
  const [options, setOptions] = useState<{ exchange: Opt[]; article: Opt[] }>({ exchange: [], article: [] })
  const [loading, setLoading] = useState(true)
  const [savingSlot, setSavingSlot] = useState<string | null>(null)
  const [savedSlot, setSavedSlot] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) window.location.href = '/admin/login' })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/featured')
    if (r.status === 401) { window.location.href = '/admin/login'; return }
    if (r.ok) {
      const d = await r.json()
      setMeta(d.meta); setSlots(d.slots); setOptions(d.options)
    }
    setLoading(false)
  }

  const nameFor = (kind: 'exchange' | 'article', slug: string) =>
    options[kind]?.find(o => o.slug === slug)?.name ?? slug

  function update(slot: string, items: string[]) {
    setSlots(s => ({ ...s, [slot]: items }))
    setSavedSlot(prev => (prev === slot ? null : prev))
  }
  function move(slot: string, i: number, dir: -1 | 1) {
    const arr = [...(slots[slot] ?? [])]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    update(slot, arr)
  }
  const removeAt = (slot: string, i: number) => update(slot, (slots[slot] ?? []).filter((_, idx) => idx !== i))
  function add(slot: string, slug: string) {
    if (!slug || (slots[slot] ?? []).includes(slug)) return
    update(slot, [...(slots[slot] ?? []), slug])
  }

  async function save(slot: string) {
    setSavingSlot(slot); setError('')
    const r = await fetch('/api/admin/featured', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, items: slots[slot] ?? [] }),
    })
    setSavingSlot(null)
    if (r.ok) { setSavedSlot(slot); setTimeout(() => setSavedSlot(s => (s === slot ? null : s)), 2000) }
    else { const d = await r.json().catch(() => ({})); setError(d.error || 'Save failed') }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors">← Admin</Link>
        <h1 className="text-lg font-semibold">Featured &amp; Deals</h1>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto">
        <p className="text-sm text-zinc-400 mb-6">
          Curate what leads the homepage and bonuses page. Reorder with the arrows; the top item shows first.
          Changes go live within ~5 minutes (pages revalidate).
        </p>
        {error && <p className="mb-4 text-red-400 text-sm">{error}</p>}

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {meta.map(m => {
              const items = slots[m.slot] ?? []
              const opts = options[m.kind] ?? []
              const available = opts.filter(o => !items.includes(o.slug))
              return (
                <div key={m.slot} className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h2 className="text-sm font-semibold text-zinc-100">{m.label}</h2>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">{m.kind}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-4">{m.help}</p>

                  {items.length === 0 ? (
                    <p className="text-xs text-zinc-600 mb-3">
                      Nothing selected{m.slot === 'featured_articles' ? ' — homepage falls back to the latest 6 articles.' : '.'}
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2 mb-4">
                      {items.map((slug, i) => (
                        <li key={slug} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                          <span className="w-5 text-center text-xs font-mono text-zinc-500">{i + 1}</span>
                          <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate">
                            {nameFor(m.kind, slug)}
                            <span className="text-zinc-500 text-xs"> · {slug}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => move(m.slot, i, -1)} disabled={i === 0}
                              className={`${BTN_SM} bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30`}>↑</button>
                            <button onClick={() => move(m.slot, i, 1)} disabled={i === items.length - 1}
                              className={`${BTN_SM} bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30`}>↓</button>
                            <button onClick={() => removeAt(m.slot, i)}
                              className={`${BTN_SM} bg-red-900/40 hover:bg-red-900/70 text-red-400`}>Remove</button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value=""
                      onChange={e => { add(m.slot, e.target.value); e.currentTarget.value = '' }}
                      disabled={available.length === 0}
                      className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                    >
                      <option value="">{available.length === 0 ? 'All added' : `Add ${m.kind}…`}</option>
                      {available.map(o => (
                        <option key={o.slug} value={o.slug}>{o.name}{o.category ? ` (${o.category})` : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => save(m.slot)}
                      disabled={savingSlot === m.slot}
                      className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingSlot === m.slot ? 'Saving…' : savedSlot === m.slot ? 'Saved ✓' : 'Save'}
                    </button>
                  </div>
                  {m.slot === 'featured_articles' && items.length > 6 && (
                    <p className="mt-2 text-xs text-amber-400">Only the first 6 show on the homepage.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
