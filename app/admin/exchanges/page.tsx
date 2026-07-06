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
    tradingPairs: FieldVal; makerFee: FieldVal; kyc: FieldVal; logo: FieldVal
  }
}
type Edit = {
  bonus: string; bonusDetails: string; rating: string; leverage: string
  tradingPairs: string; makerFee: string; kyc: boolean | null; affiliateUrl: string; logo: string
}
interface CustomItem {
  slug: string; name: string; logo: string; rating: string | number; makerFee: string; takerFee: string
  kyc: boolean; bonus: string; bonusAmount: string | number; bonusDetails: string; referralLink: string
  founded: string; headquarters: string; tradingPairs: string | number; leverage: string
  pros: string; reviewUrl: string; copyTrading: boolean
}

const BLANK: CustomItem = {
  slug: '', name: '', logo: '', rating: '', makerFee: '', takerFee: '', kyc: false, bonus: '', bonusAmount: '',
  bonusDetails: '', referralLink: '', founded: '', headquarters: '', tradingPairs: '', leverage: '', pros: '',
  reviewUrl: '', copyTrading: false,
}

const IN = 'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded text-sm focus:outline-none focus:border-zinc-500 placeholder-zinc-600'
const LBL = 'block text-xs text-zinc-400 mb-1'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Logo preview + upload (reuses /api/admin/upload-image → Vercel Blob URL) + paste-URL fallback.
function LogoInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function upload(file: File) {
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
    setBusy(false)
    if (r.ok) { const d = await r.json(); onChange(d.url) }
    else { const d = await r.json().catch(() => ({})); setErr(d.error || 'Upload failed') }
  }
  return (
    <div>
      <label className={LBL}>Logo</label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-10 w-10 rounded bg-white object-contain p-1 shrink-0" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-zinc-800 border border-zinc-700 grid place-items-center text-[10px] text-zinc-600">none</div>
        )}
        <label className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 cursor-pointer hover:bg-zinc-700 shrink-0">
          {busy ? 'Uploading…' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        </label>
        {value && <button type="button" onClick={() => onChange('')} className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0">Clear</button>}
      </div>
      <input className={`${IN} mt-2`} value={value} onChange={e => onChange(e.target.value)}
        placeholder="…or paste an image URL / /images/exchanges/x.png" />
      {err && <p className="text-red-400 text-xs mt-1">{err}</p>}
    </div>
  )
}

// Full field set for a custom (DB-only) exchange — reused by the add form and per-row edit.
function CustomFields({ v, set, slugLocked }: { v: CustomItem; set: <K extends keyof CustomItem>(k: K, val: CustomItem[K]) => void; slugLocked: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className={LBL}>Name *</label>
        <input className={IN} value={v.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Hyperliquid" />
      </div>
      <div>
        <label className={LBL}>Slug {slugLocked ? '' : '(auto)'}</label>
        <input className={`${IN} ${slugLocked ? 'opacity-60' : ''}`} value={slugLocked ? v.slug : (v.slug || slugify(v.name))}
          readOnly={slugLocked} onChange={e => set('slug', slugify(e.target.value))} placeholder="hyperliquid" />
      </div>
      <div className="md:col-span-2">
        <label className={LBL}>Welcome Bonus</label>
        <input className={IN} value={v.bonus} onChange={e => set('bonus', e.target.value)} placeholder="Up to $10,000 USDT" />
      </div>
      <div className="md:col-span-2">
        <label className={LBL}>Affiliate / Referral Link *</label>
        <input className={IN} value={v.referralLink} onChange={e => set('referralLink', e.target.value)} placeholder="https://…" />
      </div>
      <div className="md:col-span-2">
        <label className={LBL}>Bonus Details</label>
        <textarea className={IN} rows={2} value={v.bonusDetails} onChange={e => set('bonusDetails', e.target.value)} placeholder="Terms, deposit requirement, etc." />
      </div>
      <div>
        <label className={LBL}>Rating (0–10)</label>
        <input className={IN} type="number" step="0.1" value={v.rating} onChange={e => set('rating', e.target.value)} placeholder="8.5" />
      </div>
      <div>
        <label className={LBL}>Bonus Amount (USD, for sorting)</label>
        <input className={IN} type="number" value={v.bonusAmount} onChange={e => set('bonusAmount', e.target.value)} placeholder="10000" />
      </div>
      <div>
        <label className={LBL}>Leverage</label>
        <input className={IN} value={v.leverage} onChange={e => set('leverage', e.target.value)} placeholder="Up to 100x" />
      </div>
      <div>
        <label className={LBL}>Trading Pairs</label>
        <input className={IN} type="number" value={v.tradingPairs} onChange={e => set('tradingPairs', e.target.value)} placeholder="300" />
      </div>
      <div>
        <label className={LBL}>Maker Fee</label>
        <input className={IN} value={v.makerFee} onChange={e => set('makerFee', e.target.value)} placeholder="0.02%" />
      </div>
      <div>
        <label className={LBL}>Taker Fee</label>
        <input className={IN} value={v.takerFee} onChange={e => set('takerFee', e.target.value)} placeholder="0.06%" />
      </div>
      <div>
        <label className={LBL}>Founded</label>
        <input className={IN} value={v.founded} onChange={e => set('founded', e.target.value)} placeholder="2023" />
      </div>
      <div>
        <label className={LBL}>Headquarters</label>
        <input className={IN} value={v.headquarters} onChange={e => set('headquarters', e.target.value)} placeholder="Seychelles" />
      </div>
      <div>
        <label className={LBL}>Review URL <span className="text-zinc-600">(optional)</span></label>
        <input className={IN} value={v.reviewUrl} onChange={e => set('reviewUrl', e.target.value)} placeholder="/reviews/x-review" />
      </div>
      <div className="md:col-span-2">
        <LogoInput value={v.logo} onChange={val => set('logo', val)} />
      </div>
      <div className="md:col-span-2">
        <label className={LBL}>Pros <span className="text-zinc-600">(one per line)</span></label>
        <textarea className={IN} rows={3} value={v.pros} onChange={e => set('pros', e.target.value)} placeholder={"Deep liquidity\nNo KYC for small withdrawals\nLow fees"} />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={v.kyc} onChange={e => set('kyc', e.target.checked)} /> KYC required
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={v.copyTrading} onChange={e => set('copyTrading', e.target.checked)} /> Copy trading
      </label>
    </div>
  )
}

export default function ExchangesAdmin() {
  const [items, setItems] = useState<Item[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [customs, setCustoms] = useState<CustomItem[]>([])
  const [customEdits, setCustomEdits] = useState<Record<string, CustomItem>>({})
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<CustomItem>(BLANK)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) window.location.href = '/admin/login' })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/exchanges')
    if (r.status === 401) { window.location.href = '/admin/login'; return }
    if (r.ok) {
      const data = (await r.json()) as { items: Item[]; custom: CustomItem[] }
      setItems(data.items)
      const e: Record<string, Edit> = {}
      for (const it of data.items) {
        e[it.slug] = {
          bonus: String(it.fields.bonus.value ?? ''),
          bonusDetails: String(it.fields.bonusDetails.value ?? ''),
          rating: String(it.fields.rating.value ?? ''),
          leverage: String(it.fields.leverage.value ?? ''),
          tradingPairs: String(it.fields.tradingPairs.value ?? ''),
          makerFee: String(it.fields.makerFee.value ?? ''),
          kyc: (it.fields.kyc.value as boolean | null) ?? null,
          affiliateUrl: it.affiliateUrl ?? '',
          logo: String(it.fields.logo?.value ?? ''),
        }
      }
      setEdits(e)
      setCustoms(data.custom)
      const ce: Record<string, CustomItem> = {}
      for (const c of data.custom) ce[c.slug] = { ...c }
      setCustomEdits(ce)
    }
    setLoading(false)
  }

  function set<K extends keyof Edit>(slug: string, key: K, val: Edit[K]) {
    setEdits(e => ({ ...e, [slug]: { ...e[slug], [key]: val } }))
    setSavedSlug(s => (s === slug ? null : s))
  }

  async function saveStatic(slug: string) {
    setSavingSlug(slug); setError('')
    const ed = edits[slug]
    const r = await fetch('/api/admin/exchanges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        fields: {
          bonus: ed.bonus, bonusDetails: ed.bonusDetails, rating: ed.rating, leverage: ed.leverage,
          tradingPairs: ed.tradingPairs, makerFee: ed.makerFee, kyc: ed.kyc, logo: ed.logo,
        },
        affiliateUrl: ed.affiliateUrl,
      }),
    })
    setSavingSlug(null)
    if (r.ok) { setSavedSlug(slug); setTimeout(() => setSavedSlug(s => (s === slug ? null : s)), 2500) }
    else { const d = await r.json().catch(() => ({})); setError(d.error || 'Save failed') }
  }

  async function postCustom(item: CustomItem): Promise<boolean> {
    setError('')
    const r = await fetch('/api/admin/exchanges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, slug: item.slug || slugify(item.name) }),
    })
    if (r.ok) return true
    const d = await r.json().catch(() => ({})); setError(d.error || 'Save failed'); return false
  }

  async function addCustom() {
    if (!addForm.name.trim()) { setError('Name is required'); return }
    if (!addForm.referralLink.trim()) { setError('Affiliate / referral link is required'); return }
    setBusy('add')
    const ok = await postCustom(addForm)
    setBusy(null)
    if (ok) { setAddForm(BLANK); setAddOpen(false); await load() }
  }

  async function saveCustom(slug: string) {
    setBusy(slug)
    const ok = await postCustom(customEdits[slug])
    setBusy(null)
    if (ok) { setSavedSlug(slug); setTimeout(() => setSavedSlug(s => (s === slug ? null : s)), 2500) }
  }

  async function deleteCustom(slug: string, name: string) {
    if (!confirm(`Delete custom exchange "${name}"? This removes its bonus box.`)) return
    setBusy(slug)
    const r = await fetch(`/api/admin/exchanges?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
    setBusy(null)
    if (r.ok) await load()
    else setError('Delete failed')
  }

  const ql = q.toLowerCase()
  const shownStatic = q ? items.filter(i => (i.name + i.slug).toLowerCase().includes(ql)) : items
  const shownCustom = q ? customs.filter(i => (i.name + i.slug).toLowerCase().includes(ql)) : customs

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 text-sm">← Admin</Link>
        <h1 className="text-lg font-semibold">Exchanges</h1>
        <Link href="/admin/affiliate-links" className="ml-auto text-xs text-blue-400 hover:text-blue-300">Affiliate Links →</Link>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto">
        <p className="text-sm text-zinc-400 mb-4">
          Edit each exchange&apos;s welcome bonus, key stats, and affiliate link. Leave a field blank to keep the built-in
          default (shown as the placeholder). Add a brand-new exchange with <span className="text-emerald-400">+ Add Exchange</span> —
          it renders as its own bonus box &amp; comparison row. Saves apply within a few seconds.
        </p>
        {error && <p className="mb-4 text-red-400 text-sm">{error}</p>}

        <div className="flex items-center gap-3 mb-4">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search exchanges…" className={IN} />
          <button onClick={() => { setAddOpen(o => !o); setError('') }}
            className="shrink-0 px-4 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-500">
            {addOpen ? 'Close' : '+ Add Exchange'}
          </button>
        </div>

        {addOpen && (
          <div className="mb-6 rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-4">
            <h3 className="text-sm font-semibold text-emerald-300 mb-3">New Exchange</h3>
            <CustomFields v={addForm} set={(k, val) => setAddForm(f => ({ ...f, [k]: val }))} slugLocked={false} />
            <div className="mt-4 flex items-center gap-3">
              <button onClick={addCustom} disabled={busy === 'add'}
                className="px-4 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
                {busy === 'add' ? 'Adding…' : 'Add Exchange'}
              </button>
              <button onClick={() => { setAddOpen(false); setAddForm(BLANK) }} className="text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : (
          <>
            {shownCustom.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">Custom Exchanges</h2>
                <div className="flex flex-col gap-3">
                  {shownCustom.map(c => {
                    const ed = customEdits[c.slug]
                    if (!ed) return null
                    return (
                      <details key={c.slug} className="group rounded-xl border border-emerald-800/50 bg-zinc-900 overflow-hidden">
                        <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 list-none select-none hover:bg-zinc-800/40">
                          <span className="font-medium text-zinc-100">{c.name}</span>
                          <span className="text-xs text-zinc-500 truncate">{ed.bonus}</span>
                          <span className="ml-auto text-zinc-500 text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                        </summary>
                        <div className="border-t border-zinc-800 p-4">
                          <CustomFields v={ed} set={(k, val) => setCustomEdits(m => ({ ...m, [c.slug]: { ...m[c.slug], [k]: val } }))} slugLocked />
                          <div className="mt-4 flex items-center gap-3">
                            <button onClick={() => saveCustom(c.slug)} disabled={busy === c.slug}
                              className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
                              {busy === c.slug ? 'Saving…' : savedSlug === c.slug ? 'Saved ✓' : 'Save'}
                            </button>
                            <button onClick={() => deleteCustom(c.slug, c.name)} disabled={busy === c.slug}
                              className="px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-800/60 rounded text-sm hover:bg-red-900/70 disabled:opacity-50">
                              Delete
                            </button>
                          </div>
                        </div>
                      </details>
                    )
                  })}
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Built-in Exchanges</h2>
            <div className="flex flex-col gap-3">
              {shownStatic.map(it => {
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
                        <LogoInput value={ed.logo} onChange={v => set(it.slug, 'logo', v)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className={LBL}>Affiliate URL <span className="text-zinc-600">(shared with Affiliate Links admin)</span></label>
                        <input className={IN} value={ed.affiliateUrl} placeholder={it.defaultReferralLink}
                          onChange={e => set(it.slug, 'affiliateUrl', e.target.value)} />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-3 pt-1">
                        <button onClick={() => saveStatic(it.slug)} disabled={savingSlug === it.slug}
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
          </>
        )}
      </div>
    </div>
  )
}
