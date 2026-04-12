'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type LinkRow = {
  slug: string
  name: string
  affiliate_url: string
  general_url: string | null
  notes: string | null
  updated_at: string
}

export default function AffiliateLinksPage() {
  const router = useRouter()
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<LinkRow>>({})
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ slug: '', name: '', affiliate_url: '', general_url: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    loadLinks()
  }, [router])

  async function loadLinks() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/affiliate-links')
      const data = await res.json()
      setLinks(data)
    } catch {
      setError('Failed to load links')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(link: LinkRow) {
    setEditingSlug(link.slug)
    setEditForm({
      name: link.name,
      affiliate_url: link.affiliate_url,
      general_url: link.general_url ?? '',
      notes: link.notes ?? '',
    })
  }

  async function saveEdit(slug: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/affiliate-links/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditingSlug(null)
      await loadLinks()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteLink(slug: string) {
    if (!confirm(`Delete affiliate link for "${slug}"?`)) return
    try {
      await fetch(`/api/admin/affiliate-links/${slug}`, { method: 'DELETE' })
      await loadLinks()
    } catch {
      setError('Delete failed')
    }
  }

  async function addLink() {
    if (!addForm.slug || !addForm.name || !addForm.affiliate_url) {
      setError('Slug, name and affiliate URL are required')
      return
    }
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/admin/affiliate-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowAdd(false)
      setAddForm({ slug: '', name: '', affiliate_url: '', general_url: '', notes: '' })
      await loadLinks()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  function copyUrl(url: string, slug: string) {
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const ic = 'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 text-sm">← Admin</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">Affiliate Links</span>
        <button
          onClick={() => { setShowAdd(true); setError('') }}
          className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Add Link
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="mb-6 bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-4">Add New Affiliate Link</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Slug * <span className="text-zinc-600">(e.g. bingx)</span></label>
                <input value={addForm.slug} onChange={e => setAddForm(f => ({ ...f, slug: e.target.value }))} className={ic} placeholder="bingx" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Exchange Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} className={ic} placeholder="BingX" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Affiliate URL *</label>
                <input value={addForm.affiliate_url} onChange={e => setAddForm(f => ({ ...f, affiliate_url: e.target.value }))} className={ic} placeholder="https://bingx.com/partner/..." />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">General URL <span className="text-zinc-600">(fallback if no affiliate)</span></label>
                <input value={addForm.general_url} onChange={e => setAddForm(f => ({ ...f, general_url: e.target.value }))} className={ic} placeholder="https://bingx.com" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} className={ic} placeholder="e.g. 20% commission, expires Dec 2026" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={addLink} disabled={adding} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 text-sm font-medium">
                {adding ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">Loading…</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Exchange</th>
                  <th className="text-left px-4 py-3">Affiliate URL</th>
                  <th className="text-left px-4 py-3">Notes</th>
                  <th className="text-left px-4 py-3">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <tr key={link.slug} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30">
                    {editingSlug === link.slug ? (
                      // Edit row
                      <>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={ic} placeholder="Name" />
                            <span className="text-xs text-zinc-600 font-mono">{link.slug}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3" colSpan={2}>
                          <div className="space-y-1.5">
                            <input value={editForm.affiliate_url ?? ''} onChange={e => setEditForm(f => ({ ...f, affiliate_url: e.target.value }))} className={ic} placeholder="Affiliate URL" />
                            <input value={editForm.general_url ?? ''} onChange={e => setEditForm(f => ({ ...f, general_url: e.target.value }))} className={ic} placeholder="General URL (fallback)" />
                            <input value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className={ic} placeholder="Notes" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 text-xs">editing</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => saveEdit(link.slug)} disabled={saving} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingSlug(null)} className="px-3 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // View row
                      <>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-zinc-100">{link.name}</p>
                            <p className="text-xs text-zinc-600 font-mono">{link.slug}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300 font-mono text-xs truncate">{link.affiliate_url}</span>
                            <button
                              onClick={() => copyUrl(link.affiliate_url, link.slug)}
                              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              {copiedSlug === link.slug ? '✓' : 'Copy'}
                            </button>
                          </div>
                          {link.general_url && link.general_url !== link.affiliate_url && (
                            <p className="text-xs text-zinc-600 mt-0.5 font-mono truncate">Fallback: {link.general_url}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs max-w-[160px]">
                          {link.notes ?? <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">
                          {new Date(link.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => startEdit(link)} className="px-3 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600">
                              Edit
                            </button>
                            <button onClick={() => deleteLink(link.slug)} className="px-3 py-1 bg-red-900/40 text-red-400 border border-red-800/60 rounded text-xs hover:bg-red-900/70">
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
