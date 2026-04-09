'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { categories } from '@/lib/data/categories'
import TipTapEditor from '@/components/admin/tiptap-editor'

const ALL_LOCALES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh-CN', name: 'Simplified Chinese', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Traditional Chinese', flag: '🇹🇼' },
]

export default function AdminPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [articles, setArticles] = useState([])
  const [showArticles, setShowArticles] = useState(false)
  const [editingArticle, setEditingArticle] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [thumbnailPreview, setThumbnailPreview] = useState('')
  const [formError, setFormError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [translationStatus, setTranslationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [translationLog, setTranslationLog] = useState<string>('')
  const [translatingSlug, setTranslatingSlug] = useState<string | null>(null)
  const [newsletterLoading, setNewsletterLoading] = useState<string | null>(null)
  const [newsletterModal, setNewsletterModal] = useState<{ slug: string; title: string; html: string } | null>(null)
  const [htmlCopied, setHtmlCopied] = useState(false)
  const [selectedLocales, setSelectedLocales] = useState<string[]>(['es', 'pt', 'de', 'fr'])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [translatedLocales, setTranslatedLocales] = useState<Record<string, string[]>>({})

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    category: '',
    category_slug: '',
    author: '',
    rating: '',
    read_time: '',
    date: new Date().toISOString().split('T')[0],
    thumbnail: '',
    tags: '',
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
  })

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/check-session')
      if (res.ok) {
        setIsAuthenticated(true)
        fetchArticles()
      }
    } catch (err) {
      console.error('Auth check failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        setIsAuthenticated(true)
        setPassword('')
        fetchArticles()
      } else {
        setError('Invalid password')
      }
    } catch (err) {
      setError('Login failed')
    }
  }

  async function fetchArticles() {
    try {
      const [articlesRes, statusRes] = await Promise.all([
        fetch('/api/admin/articles', { cache: 'no-store' }),
        fetch('/api/translate/status', { cache: 'no-store' }),
      ])
      if (articlesRes.ok) {
        const data = await articlesRes.json()
        setArticles(data)
        setShowArticles(true)
      }
      if (statusRes.ok) {
        const status = await statusRes.json()
        setTranslatedLocales(status)
      }
    } catch (err) {
      console.error('Failed to fetch articles')
    }
  }

  async function handleSaveArticle(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (imageUploading) return

    if (!formData.title.trim()) { setFormError('Title is required'); return }
    if (!formData.slug.trim()) { setFormError('Slug is required'); return }
    if (!formData.category_slug) { setFormError('Please select a category'); return }
    if (!formData.content.trim()) { setFormError('Content is required'); return }

    try {
      const payload = {
        ...formData,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        tags: formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        meta_keywords: formData.meta_keywords || null,
        thumbnail: formData.thumbnail || null,
      }

      const url = editingArticle
        ? `/api/admin/articles/${editingArticle.id}`
        : '/api/admin/articles'
      const method = editingArticle ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 401) {
        setIsAuthenticated(false)
        return
      }

      if (res.ok) {
        setFormData({
          title: '', slug: '', excerpt: '', content: '',
          category: '', category_slug: '', author: '', rating: '', read_time: '',
          date: new Date().toISOString().split('T')[0], thumbnail: '',
          tags: '', meta_title: '', meta_description: '', meta_keywords: '',
        })
        setThumbnailPreview('')
        setEditingArticle(null)
        fetchArticles()
      } else {
        const json = await res.json().catch(() => ({}))
        alert(`Failed to save article: ${json.error ?? res.statusText}`)
      }
    } catch (err: any) {
      alert(`Failed to save article: ${err.message ?? 'Unknown error'}`)
    }
  }

  async function handleTogglePublish(id: number, currentlyPublished: boolean) {
    try {
      const res = await fetch(`/api/admin/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !currentlyPublished }),
      })
      if (res.ok) {
        fetchArticles()
      }
    } catch (err) {
      console.error('Failed to toggle publish')
    }
  }

  async function handleDeleteArticle(id: number) {
    if (!confirm('Delete this article?')) return

    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchArticles()
      }
    } catch (err) {
      console.error('Failed to delete article')
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => setThumbnailPreview(evt.target?.result as string)
    reader.readAsDataURL(file)
    setImageUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
      if (res.status === 401) { setIsAuthenticated(false); return }
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
      setFormData((prev) => ({ ...prev, thumbnail: json.url }))
    } catch (err: any) {
      alert(err.message ?? 'Image upload failed')
      setThumbnailPreview(formData.thumbnail)
    } finally {
      setImageUploading(false)
    }
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = categories.find((c) => c.slug === e.target.value)
    setFormData({ ...formData, category: selected?.title || '', category_slug: selected?.slug || '' })
  }

  async function handleSetupTranslations() {
    setTranslationStatus('running')
    setTranslationLog('Creating translations table…')
    try {
      const res = await fetch('/api/translate/setup', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setTranslationLog('✓ ' + (json.message || 'Table created'))
        setTranslationStatus('done')
      } else {
        setTranslationLog('Error: ' + (json.error || res.statusText))
        setTranslationStatus('error')
      }
    } catch (err: any) {
      setTranslationLog('Error: ' + err.message)
      setTranslationStatus('error')
    }
  }

  async function handleTranslateAll() {
    if (selectedLocales.length === 0) { alert('Select at least one language first.'); return }
    if (selectedSlugs.length === 0) { alert('Select at least one article first.'); return }
    if (!confirm(`Translate ${selectedSlugs.length} article(s) into ${selectedLocales.length} language(s)?`)) return
    setTranslationStatus('running')

    const toProcess = (articles as any[]).filter(a => selectedSlugs.includes(a.slug))
    const total = toProcess.length
    let done = 0
    let errors = 0

    for (const article of toProcess) {
      setTranslationLog(`Translating ${done + 1}/${total}: "${article.title}" into ${selectedLocales.length} language(s)…`)
      for (const locale of selectedLocales) {
        try {
          const res = await fetch('/api/translate/article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: article.slug, locale }),
          })
          const text = await res.text()
          let json: any
          try { json = JSON.parse(text) } catch { errors++; console.error(`Non-JSON response ${article.slug} → ${locale}:`, text); continue }
          if (!res.ok || (json.results?.[locale] as string)?.startsWith('error')) {
            errors++
            console.error(`Failed ${article.slug} → ${locale}:`, json)
          }
        } catch (err: any) {
          errors++
          console.error(`Failed ${article.slug} → ${locale}:`, err.message)
        }
      }
      done++
    }

    setTranslationLog(`✓ Done — ${done} articles × ${selectedLocales.length} language(s). ${errors > 0 ? `${errors} error(s) — check console.` : 'No errors.'}`)
    setTranslationStatus(errors > 0 ? 'error' : 'done')
    fetch('/api/translate/status', { cache: 'no-store' }).then(r => r.ok && r.json()).then(s => s && setTranslatedLocales(s))
  }

  async function handleSendNewsletter(slug: string, title: string) {
    setNewsletterLoading(slug)
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setNewsletterModal({ slug, title, html: json.html })
      setHtmlCopied(false)
    } catch (err: any) {
      alert(`Newsletter error: ${err.message}`)
    } finally {
      setNewsletterLoading(null)
    }
  }

  async function handleTranslateArticle(slug: string) {
    if (selectedLocales.length === 0) { alert('Select at least one language first.'); return }
    setTranslatingSlug(slug)
    let errors = 0
    for (const locale of selectedLocales) {
      try {
        const res = await fetch('/api/translate/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, locale }),
        })
        const text = await res.text()
        let json: any
        try { json = JSON.parse(text) } catch { errors++; console.error(`Non-JSON ${slug} → ${locale}:`, text.slice(0, 200)); continue }
        if (!res.ok || (json.results?.[locale] as string)?.startsWith('error')) {
          errors++
          console.error(`Failed ${slug} → ${locale}:`, json.error || json.results?.[locale])
        }
      } catch (err: any) {
        errors++
        console.error(`Failed ${slug} → ${locale}:`, err.message)
      }
    }
    alert(errors > 0 ? `Done with ${errors} error(s) — open browser console for details.` : `✓ "${slug}" translated into ${selectedLocales.length} language(s)`)
    setTranslatingSlug(null)
    fetch('/api/translate/status', { cache: 'no-store' }).then(r => r.ok && r.json()).then(s => s && setTranslatedLocales(s))
  }

  function handleEditArticle(article) {
    setEditingArticle(article)
    setThumbnailPreview(article.thumbnail || '')
    setFormData({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt || '',
      content: article.content,
      category: article.category,
      category_slug: article.category_slug || '',
      author: article.author || '',
      rating: article.rating?.toString() || '',
      read_time: article.read_time || '',
      date: article.date || new Date().toISOString().split('T')[0],
      thumbnail: article.thumbnail || '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : article.tags || '',
      meta_title: article.meta_title || '',
      meta_description: article.meta_description || '',
      meta_keywords: article.meta_keywords || '',
    })
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500'

  if (isLoading) {
    return <div className="p-8 bg-zinc-950 min-h-screen text-zinc-400">Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg p-8 max-w-md w-full"
        >
          <h1 className="text-2xl font-bold text-zinc-100 mb-6">Admin Login</h1>
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className={`${inputClass} mb-4`}
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium"
          >
            Sign In
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Nav */}
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-lg font-bold text-zinc-100">Trading365 Admin</span>
        <button
          onClick={async () => {
            await fetch('/api/admin/session', { method: 'DELETE' })
            router.push('/admin/login')
          }}
          className="text-sm text-red-400 hover:text-red-300 font-medium"
        >
          Logout
        </button>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Panel */}
        <div className="w-1/2 bg-zinc-900 border-r border-zinc-700 p-6 overflow-y-auto">
          <div className="flex items-center gap-3 mb-6">
            {editingArticle && (
              <button
                type="button"
                onClick={() => {
                  setEditingArticle(null)
                  setThumbnailPreview('')
                  setFormData({
                    title: '', slug: '', excerpt: '', content: '',
                    category: '', category_slug: '', author: '', rating: '', read_time: '',
                    date: new Date().toISOString().split('T')[0], thumbnail: '',
                    tags: '', meta_title: '', meta_description: '', meta_keywords: '',
                  })
                }}
                className="text-zinc-400 hover:text-zinc-100 text-sm flex items-center gap-1"
              >
                ← Back
              </button>
            )}
            <h2 className="text-2xl font-bold text-zinc-100">
              {editingArticle ? 'Edit Article' : 'New Article'}
            </h2>
          </div>

          <form onSubmit={handleSaveArticle} noValidate className="space-y-4">
            {formError && (
              <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Slug *</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Category *</label>
              <select
                value={formData.category_slug}
                onChange={handleCategoryChange}
                className={inputClass}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Author</label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* Featured Image */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Featured Image</label>
              <div className="flex gap-3 items-center">
                {thumbnailPreview && (
                  <img src={thumbnailPreview} alt="Preview" className="w-20 h-14 object-cover rounded border border-zinc-700" />
                )}
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="px-3 py-1.5 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 text-sm disabled:opacity-50"
                  >
                    {imageUploading ? 'Uploading…' : thumbnailPreview ? 'Replace' : 'Upload Image'}
                  </button>
                  <p className="text-xs text-zinc-500 mt-1">Max 5MB</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Excerpt</label>
              <textarea
                value={formData.excerpt}
                onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Content *</label>
              <TipTapEditor
                content={formData.content}
                onChange={(html) => setFormData({ ...formData, content: html })}
              />
            </div>

            {/* SEO */}
            <div className="border-t border-zinc-700 pt-4">
              <p className="text-sm font-semibold text-zinc-300 mb-3">SEO</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Meta Title <span className="text-zinc-500 font-normal">({formData.meta_title.length}/60)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="Defaults to article title"
                    value={formData.meta_title}
                    onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Meta Description <span className="text-zinc-500 font-normal">({formData.meta_description.length}/160)</span>
                  </label>
                  <textarea
                    maxLength={160}
                    rows={2}
                    placeholder="Defaults to excerpt"
                    value={formData.meta_description}
                    onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Meta Keywords</label>
                  <input
                    type="text"
                    placeholder="keyword1, keyword2, keyword3"
                    value={formData.meta_keywords}
                    onChange={(e) => setFormData({ ...formData, meta_keywords: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={imageUploading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {editingArticle ? 'Update' : 'Create'} Article
              </button>
              {editingArticle && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingArticle(null)
                    setThumbnailPreview('')
                    setFormData({
                      title: '', slug: '', excerpt: '', content: '',
                      category: '', category_slug: '', author: '', rating: '', read_time: '',
                      date: new Date().toISOString().split('T')[0], thumbnail: '',
                      tags: '', meta_title: '', meta_description: '', meta_keywords: '',
                    })
                  }}
                  className="flex-1 bg-zinc-700 text-zinc-200 py-2 rounded-lg hover:bg-zinc-600 font-medium"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Articles List Panel */}
        <div className="w-1/2 bg-zinc-950 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-zinc-100">Articles ({articles.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => setSelectedSlugs((articles as any[]).map(a => a.slug))} className="text-xs text-zinc-400 hover:text-zinc-200">All</button>
                <span className="text-zinc-600">·</span>
                <button onClick={() => setSelectedSlugs([])} className="text-xs text-zinc-400 hover:text-zinc-200">None</button>
              </div>
              {selectedSlugs.length > 0 && (
                <span className="text-xs text-purple-400">{selectedSlugs.length} selected</span>
              )}
            </div>
            <button
              onClick={async () => {
                const res = await fetch('/api/admin/run-migration', { method: 'POST' })
                const json = await res.json()
                alert(json.success ? 'Migration done!' : `Error: ${json.error}`)
              }}
              className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 text-sm"
            >
              Run Migration
            </button>
          </div>

          {/* Translations */}
          <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-100">Translations</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedLocales(ALL_LOCALES.map(l => l.code))} className="text-xs text-zinc-400 hover:text-zinc-200">All</button>
                <span className="text-zinc-600">·</span>
                <button onClick={() => setSelectedLocales([])} className="text-xs text-zinc-400 hover:text-zinc-200">None</button>
              </div>
            </div>

            {/* Language toggles */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {ALL_LOCALES.map((loc) => {
                const active = selectedLocales.includes(loc.code)
                return (
                  <button
                    key={loc.code}
                    onClick={() => setSelectedLocales(prev =>
                      active ? prev.filter(c => c !== loc.code) : [...prev, loc.code]
                    )}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-purple-800 border-purple-600 text-purple-100'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {loc.flag} {loc.name}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={handleSetupTranslations}
                disabled={translationStatus === 'running'}
                className="px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 text-sm disabled:opacity-50"
              >
                Setup DB
              </button>
              <button
                onClick={handleTranslateAll}
                disabled={translationStatus === 'running' || selectedLocales.length === 0 || selectedSlugs.length === 0}
                className="px-3 py-1.5 bg-purple-700 text-white rounded-lg hover:bg-purple-600 text-sm disabled:opacity-50 font-medium"
              >
                {translationStatus === 'running'
                  ? 'Translating…'
                  : `Translate ${selectedSlugs.length} article(s) × ${selectedLocales.length} lang`}
              </button>
            </div>

            {translationLog && (
              <p className={`text-xs font-mono px-3 py-2 rounded ${
                translationStatus === 'error'
                  ? 'bg-red-900/30 text-red-400'
                  : translationStatus === 'done'
                  ? 'bg-green-900/30 text-green-400'
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {translationLog}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {(articles as any[]).map((article) => {
              const isSelected = selectedSlugs.includes(article.slug)
              return (
                <div
                  key={article.id}
                  className={`bg-zinc-900 p-4 rounded-lg border transition cursor-pointer ${isSelected ? 'border-purple-600 bg-purple-950/20' : 'border-zinc-700 hover:border-zinc-500'}`}
                  onClick={() => setSelectedSlugs(prev => isSelected ? prev.filter(s => s !== article.slug) : [...prev, article.slug])}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-zinc-600'}`}>
                      {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-zinc-100">{article.title}</h3>
                        {!article.published && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 font-medium">Draft</span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">{article.category}</p>
                      {/* Translation status flags */}
                      {(() => {
                        const done = translatedLocales[article.slug] ?? []
                        const missing = ALL_LOCALES.filter(l => !done.includes(l.code))
                        return (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {ALL_LOCALES.map(loc => {
                              const translated = done.includes(loc.code)
                              return (
                                <span
                                  key={loc.code}
                                  title={`${loc.name}${translated ? ' — translated' : ' — not translated'}`}
                                  className={`text-sm px-1.5 py-0.5 rounded text-xs ${translated ? 'bg-green-900/50 text-green-300' : 'bg-zinc-800 text-zinc-600'}`}
                                >
                                  {loc.flag}
                                </span>
                              )
                            })}
                          </div>
                        )
                      })()}
                      <div className="flex flex-wrap gap-2 mt-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditArticle(article)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleTogglePublish(article.id, article.published)}
                          className={`px-3 py-1 rounded text-sm font-medium ${article.published ? 'bg-yellow-700 text-yellow-100 hover:bg-yellow-600' : 'bg-green-700 text-white hover:bg-green-600'}`}
                        >
                          {article.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => handleDeleteArticle(article.id)}
                          className="px-3 py-1 bg-red-700 text-white rounded text-sm hover:bg-red-600"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleTranslateArticle(article.slug)}
                          disabled={translatingSlug === article.slug}
                          className="px-3 py-1 bg-purple-800 text-purple-200 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
                        >
                          {translatingSlug === article.slug ? 'Translating…' : 'Translate'}
                        </button>
                        <button
                          onClick={() => handleSendNewsletter(article.slug, article.title)}
                          disabled={newsletterLoading === article.slug}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 disabled:opacity-50"
                        >
                          {newsletterLoading === article.slug ? 'Building…' : 'Newsletter'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Newsletter HTML Modal */}
      {newsletterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Newsletter email HTML</p>
                <p className="text-sm font-semibold text-zinc-100 line-clamp-1">{newsletterModal.title}</p>
              </div>
              <button
                onClick={() => setNewsletterModal(null)}
                className="text-zinc-400 hover:text-zinc-100 text-xl leading-none px-1"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 border-b border-zinc-700 bg-zinc-800/50">
              <p className="text-xs text-zinc-300 font-medium mb-1">How to send via Beehiiv:</p>
              <ol className="text-xs text-zinc-400 space-y-0.5 list-decimal list-inside">
                <li>Copy the HTML below</li>
                <li>Go to <span className="text-amber-400">app.beehiiv.com</span> → New Post</li>
                <li>Click <span className="text-amber-400">Edit HTML</span> (or the &lt;/&gt; button)</li>
                <li>Paste and save — then preview &amp; send</li>
              </ol>
              <p className="text-xs text-zinc-500 mt-2">
                Or connect your RSS feed at <span className="text-amber-400">trading365.org/feed.xml</span> to auto-send new articles.
              </p>
            </div>

            <textarea
              readOnly
              value={newsletterModal.html}
              className="flex-1 bg-zinc-950 text-zinc-300 text-xs font-mono p-4 resize-none outline-none overflow-y-auto"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />

            <div className="px-5 py-4 border-t border-zinc-700 flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newsletterModal.html)
                  setHtmlCopied(true)
                  setTimeout(() => setHtmlCopied(false), 3000)
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  htmlCopied
                    ? 'bg-green-700 text-white'
                    : 'bg-amber-600 text-white hover:bg-amber-500'
                }`}
              >
                {htmlCopied ? '✓ Copied!' : 'Copy HTML'}
              </button>
              <button
                onClick={() => setNewsletterModal(null)}
                className="px-6 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
