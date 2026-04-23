'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

interface Promotion {
  id: number
  name: string
  image_url: string
  destination_url: string
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

const INPUT = 'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded text-sm focus:outline-none focus:border-zinc-500 placeholder-zinc-500'
const BTN_SM = 'px-3 py-1 text-xs rounded font-medium transition-colors'

export default function PromotionsAdmin() {
  const [items, setItems] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Promotion>>({})
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', image_url: '', destination_url: '', active: true, display_order: 0 })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [uploadingFor, setUploadingFor] = useState<'add' | number | null>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) window.location.href = '/admin/login'
    })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/promotions')
    if (r.ok) setItems(await r.json())
    setLoading(false)
  }

  async function uploadImage(file: File, target: 'add' | number) {
    setUploadingFor(target)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
    const data = await r.json()
    setUploadingFor(null)
    if (!r.ok) { setError(data.error || 'Upload failed'); return }
    if (target === 'add') {
      setAddForm(f => ({ ...f, image_url: data.url }))
    } else {
      setEditForm(f => ({ ...f, image_url: data.url }))
    }
  }

  async function handleAdd() {
    if (!addForm.name || !addForm.image_url || !addForm.destination_url) {
      setError('Name, image, and destination URL are required')
      return
    }
    setAdding(true)
    setError('')
    const r = await fetch('/api/admin/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const data = await r.json()
    setAdding(false)
    if (!r.ok) { setError(data.error || 'Failed to add'); return }
    setItems(prev => [data, ...prev])
    setShowAdd(false)
    setAddForm({ name: '', image_url: '', destination_url: '', active: true, display_order: 0 })
  }

  async function handleSave(id: number) {
    setSaving(true)
    setError('')
    const r = await fetch(`/api/admin/promotions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error || 'Failed to save'); return }
    setItems(prev => prev.map(p => p.id === id ? data : p))
    setEditingId(null)
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/affiliate-links" className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-lg font-semibold">Promotions</h1>
        <span className="ml-auto text-xs text-zinc-500">{items.length} promotion{items.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => { setShowAdd(true); setError('') }}
          className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Add Promotion
        </button>
      </div>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        {error && <p className="mb-4 text-red-400 text-sm">{error}</p>}

        {/* Add Form */}
        {showAdd && (
          <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold mb-4 text-zinc-200">New Promotion</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Name</label>
                <input className={INPUT} placeholder="e.g. WEEX Summer Bonus" value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Banner Image</label>
                <div className="flex gap-2 items-start">
                  <input className={INPUT} placeholder="https://..." value={addForm.image_url}
                    onChange={e => setAddForm(f => ({ ...f, image_url: e.target.value }))} />
                  <button
                    onClick={() => addFileRef.current?.click()}
                    disabled={uploadingFor === 'add'}
                    className="shrink-0 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors disabled:opacity-50"
                  >
                    {uploadingFor === 'add' ? 'Uploading…' : 'Upload'}
                  </button>
                  <input ref={addFileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'add')} />
                </div>
                {addForm.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={addForm.image_url} alt="Preview" className="mt-2 h-16 rounded object-cover border border-zinc-700" />
                )}
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Destination URL</label>
                <input className={INPUT} placeholder="https://..." value={addForm.destination_url}
                  onChange={e => setAddForm(f => ({ ...f, destination_url: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Display Order (lower = first)</label>
                <input className={INPUT} type="number" value={addForm.display_order}
                  onChange={e => setAddForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="add-active" checked={addForm.active}
                  onChange={e => setAddForm(f => ({ ...f, active: e.target.checked }))}
                  className="accent-primary" />
                <label htmlFor="add-active" className="text-sm text-zinc-300">Active</label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleAdd} disabled={adding}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                {adding ? 'Adding…' : 'Add Promotion'}
              </button>
              <button onClick={() => { setShowAdd(false); setError('') }}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-500 text-sm">No promotions yet. Add one above.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
                {editingId === item.id ? (
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Name</label>
                        <input className={INPUT} value={editForm.name ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Banner Image</label>
                        <div className="flex gap-2 items-start">
                          <input className={INPUT} value={editForm.image_url ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, image_url: e.target.value }))} />
                          <button onClick={() => editFileRef.current?.click()} disabled={uploadingFor === item.id}
                            className="shrink-0 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors disabled:opacity-50">
                            {uploadingFor === item.id ? 'Uploading…' : 'Upload'}
                          </button>
                          <input ref={editFileRef} type="file" accept="image/*" className="hidden"
                            onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], item.id)} />
                        </div>
                        {editForm.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={editForm.image_url} alt="Preview" className="mt-2 h-16 rounded object-cover border border-zinc-700" />
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Destination URL</label>
                        <input className={INPUT} value={editForm.destination_url ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, destination_url: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Display Order</label>
                        <input className={INPUT} type="number" value={editForm.display_order ?? 0}
                          onChange={e => setEditForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <input type="checkbox" id={`edit-active-${item.id}`} checked={editForm.active ?? true}
                          onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))}
                          className="accent-primary" />
                        <label htmlFor={`edit-active-${item.id}`} className="text-sm text-zinc-300">Active</label>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => handleSave(item.id)} disabled={saving}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 p-4 items-center">
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.name}
                        className="h-14 w-40 object-cover rounded border border-zinc-700 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${item.active ? 'bg-green-900/60 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                          {item.active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-xs text-zinc-500">Order: {item.display_order}</span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{item.destination_url}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingId(item.id); setEditForm({ ...item }); setError('') }}
                        className={`${BTN_SM} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className={`${BTN_SM} bg-red-900/40 hover:bg-red-900/70 text-red-400`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
