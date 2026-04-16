'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { categories as staticCategories } from '@/lib/data/categories'

type CategoryRow = {
  slug: string
  title: string
  description: string
  long_description: string
  nav_label: string
  created_at: string
}

const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

export default function CategoriesPage() {
  const router = useRouter()
  const [customCategories, setCustomCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ slug: '', title: '', nav_label: '', description: '', long_description: '' })
  const [adding, setAdding] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<CategoryRow>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    loadCategories()
  }, [router])

  async function loadCategories() {
    setLoading(true)
    const res = await fetch('/api/admin/categories')
    if (res.ok) setCustomCategories(await res.json())
    setLoading(false)
  }

  function slugify(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleAdd() {
    setError('')
    if (!addForm.slug || !addForm.title) { setError('Slug and title are required'); return }
    setAdding(true)
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed'); setAdding(false); return }
    setCustomCategories(prev => [...prev, data])
    setAddForm({ slug: '', title: '', nav_label: '', description: '', long_description: '' })
    setShowAdd(false)
    setAdding(false)
  }

  async function handleSave(slug: string) {
    setSaving(true)
    const res = await fetch(`/api/admin/categories/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (res.ok) {
      setCustomCategories(prev => prev.map(c => c.slug === slug ? data : c))
      setEditingSlug(null)
    }
    setSaving(false)
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Delete category "${slug}"? This won't delete articles in this category.`)) return
    await fetch(`/api/admin/categories/${slug}`, { method: 'DELETE' })
    setCustomCategories(prev => prev.filter(c => c.slug !== slug))
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 text-sm">← Admin</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">Categories</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Static categories */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Built-in Categories</h2>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">URL</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {staticCategories.map(cat => (
                  <tr key={cat.slug} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{cat.slug}</td>
                    <td className="px-4 py-3 text-zinc-100">{cat.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400">/{cat.slug}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-900/40 text-green-400 border border-green-800">Live</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Custom categories */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Custom Categories</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              + New Category
            </button>
          </div>

          {/* Important note */}
          <div className="mb-4 px-4 py-3 bg-amber-900/20 border border-amber-700/50 rounded-lg text-xs text-amber-300">
            <strong>Note:</strong> After creating a custom category here, new route files also need to be added to the codebase before articles in that category will be publicly accessible. Contact your developer or use the generated slugs below.
          </div>

          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

          {/* Add form */}
          {showAdd && (
            <div className="mb-4 bg-zinc-900 border border-blue-700/50 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-100">New Category</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Title</label>
                  <input
                    value={addForm.title}
                    onChange={e => setAddForm(f => ({ ...f, title: e.target.value, slug: slugify(e.target.value), nav_label: e.target.value }))}
                    placeholder="e.g. DeFi Guides"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Slug (URL)</label>
                  <input
                    value={addForm.slug}
                    onChange={e => setAddForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. defi-guides"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Nav label <span className="text-zinc-600">(shown in menu)</span></label>
                <input
                  value={addForm.nav_label}
                  onChange={e => setAddForm(f => ({ ...f, nav_label: e.target.value }))}
                  placeholder="e.g. DeFi"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Short description</label>
                <input
                  value={addForm.description}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="One-line description for SEO"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Long description</label>
                <textarea
                  value={addForm.long_description}
                  onChange={e => setAddForm(f => ({ ...f, long_description: e.target.value }))}
                  rows={3}
                  placeholder="Category page intro text…"
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={adding} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {adding ? 'Creating…' : 'Create Category'}
                </button>
                <button onClick={() => { setShowAdd(false); setError('') }} className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-zinc-500 text-sm py-4">Loading…</p>
          ) : customCategories.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 text-center text-zinc-500 text-sm">
              No custom categories yet. Click <strong className="text-zinc-300">+ New Category</strong> to add one.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Slug</th>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Nav Label</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {customCategories.map(cat => (
                    <tr key={cat.slug}>
                      {editingSlug === cat.slug ? (
                        <td colSpan={4} className="px-4 py-4">
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1">Title</label>
                              <input value={editForm.title ?? ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1">Nav label</label>
                              <input value={editForm.nav_label ?? ''} onChange={e => setEditForm(f => ({ ...f, nav_label: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1">Short description</label>
                              <input value={editForm.description ?? ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1">Long description</label>
                              <input value={editForm.long_description ?? ''} onChange={e => setEditForm(f => ({ ...f, long_description: e.target.value }))} className={inputClass} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSave(cat.slug)} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingSlug(null)} className="px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded text-xs hover:bg-zinc-600">Cancel</button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-400">{cat.slug}</td>
                          <td className="px-4 py-3 text-zinc-100">{cat.title}</td>
                          <td className="px-4 py-3 text-zinc-300">{cat.nav_label}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingSlug(cat.slug); setEditForm(cat) }} className="px-2.5 py-1 bg-zinc-700 text-zinc-200 rounded text-xs hover:bg-zinc-600">Edit</button>
                              <button onClick={() => handleDelete(cat.slug)} className="px-2.5 py-1 bg-red-900/40 text-red-400 border border-red-800/50 rounded text-xs hover:bg-red-900/70">Delete</button>
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
    </div>
  )
}
