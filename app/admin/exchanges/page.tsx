'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface FieldVal { value: string | number | boolean | null; def: string | number | boolean }
interface Item {
  slug: string
  name: string
  affiliateUrl: string
  defaultReferralLink: string
  fields: {
    bonus: FieldVal; bonusDetails: FieldVal; rating: FieldVal; leverage: FieldVal
    tradingPairs: FieldVal; makerFee: FieldVal; kyc: FieldVal
  }
}
type Edit = {
  bonus: string; bonusDetails: string; rating: string; leverage: string
  tradingPairs: string; makerFee: string; kyc: boolean | null; affiliateUrl: string
}

const IN = 'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded text-sm focus:outline-none focus:border-zinc-500 placeholder-zinc-600'
const LBL = 'block text-xs text-zinc-400 mb-1'

export default function ExchangesAdmin() {
  const [items, setItems] = useState<Item[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) window.location.href = '/admin/login' })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/exchanges')
    if (r.status === 401) { window.location.href = '/admin/login'; return }
    if (r.ok) {
      const data = (await r.json()) as Item[]
      setItems(data)
      const e: Record<string, Edit> = {}
      for (const it of data) {
        e[it.slug] = {
          bonus: String(it.fields.bonus.value ?? ''),
          bonusDetails: String(it.fields.bonusDetails.value ?? ''),
          rating: String(it.fields.rating.value ?? ''),
          leverage: String(it.fields.leverage.value ?? ''),
          tradingPairs: String(it.fields.tradingPairs.value ?? ''),
          makerFee: String(it.fields.makerFee.value ?? ''),
          kyc: (it.fields.kyc.value as boolean | null) ?? null,
          affiliateUrl: it.affiliateUrl ?? '',
        }
      }
      setEdits(e)
    }
    setLoading(false)
  }

  function set<K extends keyof Edit>(slug: string, key: K, val: Edit[K]) {
    setEdits(e => ({ ...e, [slug]: { ...e[slug], [key]: val } }))
    setSavedSlug(s => (s === slug ? null : s))
  }

  async function save(slug: string) {
    setSavingSlug(slug); setError('')
    const ed = edits[slug]
    const r = await fetch('/api/admin/exchanges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        fields: {
          bonus: ed.bonus, bonusDetails: ed.bonusDetails, rating: ed.rating, leverage: ed.leverage,
          tradingPairs: ed.tradingPairs, makerFee: ed.makerFee, kyc: ed.kyc,
        },
        affiliateUrl: ed.affiliateUrl,
      }),
    })
    setSavingSlug(null)
    if (r.ok) { setSavedSlug(slug); setTimeout(() => setSavedSlug(s => (s === slug ? null : s)), 2500) }
    else { const d = await r.json().catch(() => ({})); setError(d.error || 'Save failed') }
  }

  const shown = q ? items.filter(i => (i.name + i.slug).toLowerCase().includes(q.toLowerCase())) : items

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 text-sm">← Admin</Link>
        <h1 className="text-lg font-semibold">Exchanges</h1>
        <Link href="/admin/affiliate-links" className="ml-auto text-xs text-blue-400 hover:text-blue-300">Affiliate Links →</Link>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto">
        <p className="text-sm text-zinc-400 mb-4">
          Edit each exchange&apos;s welcome bonus, key stats, and affiliate link. Leave a field blank to keep the
          built-in default (shown as the placeholder). Saves apply to the bonuses page, homepage and compare table within a few seconds.
        </p>
        {error && <p className="mb-4 text-red-400 text-sm">{error}</p>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search exchanges…" className={`${IN} mb-4`} />

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map(it => {
              const ed = edits[it.slug]
              if (!ed) return null
              return (
                <details key={it.slug} className="group rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
                  <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 list-none select-none hover:bg-zinc-800/40">
                    <span className="font-medium text-zinc-100">{it.name}</span>
                    <span className="text-xs text-zinc-500 truncate">{ed.bonus || String(it.fields.bonus.def)}</span>
                    <span className="ml-auto text-zinc-500 text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="border-t border-zinc-800 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className={LBL}>Welcome Bonus</label>
                      <input className={IN} value={ed.bonus} placeholder={String(it.fields.bonus.def)}
                        onChange={e => set(it.slug, 'bonus', e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={LBL}>Bonus Details</label>
                      <textarea className={IN} rows={2} value={ed.bonusDetails} placeholder={String(it.fields.bonusDetails.def)}
                        onChange={e => set(it.slug, 'bonusDetails', e.target.value)} />
                    </div>
                    <div>
                      <label className={LBL}>Rating</label>
                      <input className={IN} type="number" step="0.1" min="0" max="10" value={ed.rating} placeholder={String(it.fields.rating.def)}
                        onChange={e => set(it.slug, 'rating', e.target.value)} />
                    </div>
                    <div>
                      <label className={LBL}>Leverage</label>
                      <input className={IN} value={ed.leverage} placeholder={String(it.fields.leverage.def)}
                        onChange={e => set(it.slug, 'leverage', e.target.value)} />
                    </div>
                    <div>
                      <label className={LBL}>Trading Pairs</label>
                      <input className={IN} type="number" value={ed.tradingPairs} placeholder={String(it.fields.tradingPairs.def)}
                        onChange={e => set(it.slug, 'tradingPairs', e.target.value)} />
                    </div>
                    <div>
                      <label className={LBL}>Maker Fee</label>
                      <input className={IN} value={ed.makerFee} placeholder={String(it.fields.makerFee.def)}
                        onChange={e => set(it.slug, 'makerFee', e.target.value)} />
                    </div>
                    <div>
                      <label className={LBL}>KYC</label>
                      <select className={IN}
                        value={ed.kyc === null ? 'default' : ed.kyc ? 'required' : 'no'}
                        onChange={e => set(it.slug, 'kyc', e.target.value === 'default' ? null : e.target.value === 'required')}>
                        <option value="default">Default ({it.fields.kyc.def ? 'Required' : 'Not Required'})</option>
                        <option value="required">Required</option>
                        <option value="no">Not Required</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={LBL}>Affiliate URL <span className="text-zinc-600">(shared with Affiliate Links admin)</span></label>
                      <input className={IN} value={ed.affiliateUrl} placeholder={it.defaultReferralLink}
                        onChange={e => set(it.slug, 'affiliateUrl', e.target.value)} />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-3 pt-1">
                      <button onClick={() => save(it.slug)} disabled={savingSlug === it.slug}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                        {savingSlug === it.slug ? 'Saving…' : savedSlug === it.slug ? 'Saved ✓' : 'Save'}
                      </button>
                      <span className="text-xs text-zinc-600">Blank fields fall back to the code default.</span>
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
