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

  const [healthScanning, setHealthScanning] = useState(false)
  const [healthFixing, setHealthFixing] = useState(false)
  const [healthIssues, setHealthIssues] = useState<{ type: string; description: string; severity: 'error' | 'warning'; snippet: string }[] | null>(null)
  const [healthScore, setHealthScore] = useState<number | null>(null)
  const [healthError, setHealthError] = useState('')
  const [healthFixed, setHealthFixed] = useState<{ applied: number; total: number } | null>(null)

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

  const [pros, setPros] = useState<string[]>([])
  const [cons, setCons] = useState<string[]>([])
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([])

  function addPro() { setPros(p => [...p, '']) }
  function removePro(i: number) { setPros(p => p.filter((_, idx) => idx !== i)) }
  function updatePro(i: number, val: string) { setPros(p => p.map((v, idx) => idx === i ? val : v)) }

  function addCon() { setCons(p => [...p, '']) }
  function removeCon(i: number) { setCons(p => p.filter((_, idx) => idx !== i)) }
  function updateCon(i: number, val: string) { setCons(p => p.map((v, idx) => idx === i ? val : v)) }

  function addFaq() { setFaqs(p => [...p, { question: '', answer: '' }]) }
  function removeFaq(i: number) { setFaqs(p => p.filter((_, idx) => idx !== i)) }
  function updateFaq(i: number, field: 'question' | 'answer', val: string) {
    setFaqs(p => p.map((f, idx) => idx === i ? { ...f, [field]: val } : f))
  }

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
        pros: pros.filter(p => p.trim()),
        cons: cons.filter(c => c.trim()),
        faqs: faqs.filter(f => f.question.trim() || f.answer.trim()),
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
        setPros([])
        setCons([])
        setFaqs([])
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

  async function handleHealthScan() {
    if (!formData.content.trim()) return
    setHealthScanning(true)
    setHealthIssues(null)
    setHealthScore(null)
    setHealthError('')
    setHealthFixed(null)
    try {
      const res = await fetch('/api/admin/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: formData.content, mode: 'scan' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Scan failed')
      setHealthIssues(json.issues ?? [])
      setHealthScore(json.score ?? 100)
    } catch (err: any) {
      setHealthError(err.message ?? 'Scan failed')
    } finally {
      setHealthScanning(false)
    }
  }

  async function handleHealthFix() {
    if (!formData.content.trim()) return
    setHealthFixing(true)
    setHealthError('')
    setHealthFixed(null)
    try {
      const res = await fetch('/api/admin/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: formData.content, mode: 'fix', issues: healthIssues }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fix failed')
      setFormData(prev => ({ ...prev, content: json.content }))
      setHealthFixed({ applied: json.applied, total: json.total })
      // Clear issues so user knows to re-scan
      setHealthIssues(null)
      setHealthScore(null)
    } catch (err: any) {
      setHealthError(err.message ?? 'Fix failed')
    } finally {
      setHealthFixing(false)
    }
  }

  function handleEditArticle(article) {
    setEditingArticle(article)
    setHealthIssues(null)
    setHealthScore(null)
    setHealthError('')
    setHealthFixed(null)
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
    setPros(Array.isArray(article.pros) ? article.pros : [])
    setCons(Array.isArray(article.cons) ? article.cons : [])
    setFaqs(Array.isArray(article.faqs) ? article.faqs : [])
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
                  setPros([])
                  setCons([])
                  setFaqs([])
                }}
                className="text-zinc-400 hover:text-zinc-100 text-sm flex items-center gap-1"
              >
                ← Back
              </button>
            )}
            <h2 className="text-2xl font-bold text-zinc-100">
              {editingArticle ? 'Edit Article' : 'New Article'}
            </h2>
            {editingArticle && (
              <button
                type="submit"
                form="article-form"
                disabled={imageUploading}
                className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
              >
                Update Article
              </button>
            )}
          </div>

          <form id="article-form" onSubmit={handleSaveArticle} noValidate className="space-y-4">
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

            {/* Content Health Check */}
            {editingArticle && (
              <div className="border-t border-zinc-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-zinc-300">Content Health Check</p>
                  <button
                    type="button"
                    onClick={handleHealthScan}
                    disabled={healthScanning || healthFixing || !formData.content.trim()}
                    className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 disabled:opacity-50 font-medium"
                  >
                    {healthScanning ? 'Scanning…' : 'Scan for Issues'}
                  </button>
                </div>

                {healthError && (
                  <p className="text-xs text-red-400 mb-3 px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg">{healthError}</p>
                )}

                {healthFixed && (
                  <p className="text-xs text-green-400 mb-3 px-3 py-2 bg-green-900/20 border border-green-800/40 rounded-lg font-medium">
                    Fixed {healthFixed.applied} of {healthFixed.total} patches applied — click &ldquo;Scan for Issues&rdquo; to verify, then Update Article to save.
                  </p>
                )}

                {healthScore !== null && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-bold border ${
                      healthScore >= 80
                        ? 'bg-green-900/40 border-green-700/50 text-green-300'
                        : healthScore >= 60
                        ? 'bg-yellow-900/40 border-yellow-700/50 text-yellow-300'
                        : 'bg-red-900/40 border-red-700/50 text-red-300'
                    }`}>
                      Score: {healthScore}/100
                    </div>
                    {healthIssues && healthIssues.length > 0 && (
                      <button
                        type="button"
                        onClick={handleHealthFix}
                        disabled={healthFixing || healthScanning}
                        className="px-3 py-1.5 bg-orange-700 text-white rounded-lg hover:bg-orange-600 text-xs font-semibold disabled:opacity-50"
                      >
                        {healthFixing ? 'Fixing…' : `Auto-fix ${healthIssues.length} issue${healthIssues.length !== 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                )}

                {healthIssues && healthIssues.length === 0 && (
                  <p className="text-xs text-green-400 px-3 py-2 bg-green-900/20 border border-green-800/40 rounded-lg">
                    No issues found — content looks clean!
                  </p>
                )}

                {healthIssues && healthIssues.length > 0 && (
                  <div className="space-y-1.5">
                    {healthIssues.map((issue, i) => (
                      <div
                        key={i}
                        className={`px-3 py-2 rounded-lg text-xs border ${
                          issue.severity === 'error'
                            ? 'bg-red-900/20 border-red-800/40'
                            : 'bg-yellow-900/20 border-yellow-800/40'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 font-bold uppercase tracking-wide text-[10px] pt-px ${
                            issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {issue.type.replace('_', ' ')}
                          </span>
                          <span className="text-zinc-300">{issue.description}</span>
                        </div>
                        {issue.snippet && (
                          <p className="mt-1 font-mono text-zinc-500 truncate text-[10px]">{issue.snippet}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pros */}
            <div className="border-t border-zinc-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-zinc-300">Pros</p>
                <button type="button" onClick={addPro} className="text-xs px-2.5 py-1 bg-green-800 text-green-200 rounded-lg hover:bg-green-700">+ Add Pro</button>
              </div>
              {pros.length === 0 && (
                <p className="text-xs text-zinc-600 mb-2">No pros yet — click &ldquo;Add Pro&rdquo; to add one.</p>
              )}
              <div className="space-y-2">
                {pros.map((pro, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={pro}
                      onChange={(e) => updatePro(i, e.target.value)}
                      placeholder={`Pro #${i + 1}`}
                      className={inputClass}
                    />
                    <button type="button" onClick={() => removePro(i)} className="px-2 text-red-400 hover:text-red-300 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Cons */}
            <div className="border-t border-zinc-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-zinc-300">Cons</p>
                <button type="button" onClick={addCon} className="text-xs px-2.5 py-1 bg-red-900 text-red-200 rounded-lg hover:bg-red-800">+ Add Con</button>
              </div>
              {cons.length === 0 && (
                <p className="text-xs text-zinc-600 mb-2">No cons yet — click &ldquo;Add Con&rdquo; to add one.</p>
              )}
              <div className="space-y-2">
                {cons.map((con, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={con}
                      onChange={(e) => updateCon(i, e.target.value)}
                      placeholder={`Con #${i + 1}`}
                      className={inputClass}
                    />
                    <button type="button" onClick={() => removeCon(i)} className="px-2 text-red-400 hover:text-red-300 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* FAQs */}
            <div className="border-t border-zinc-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-zinc-300">FAQs</p>
                <button type="button" onClick={addFaq} className="text-xs px-2.5 py-1 bg-blue-800 text-blue-200 rounded-lg hover:bg-blue-700">+ Add FAQ</button>
              </div>
              {faqs.length === 0 && (
                <p className="text-xs text-zinc-600 mb-2">No FAQs yet — click &ldquo;Add FAQ&rdquo; to add one.</p>
              )}
              <div className="space-y-2">
                {faqs.map((faq, i) => (
                  <details key={i} className="group border border-zinc-700 rounded-lg bg-zinc-800" open>
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 list-none select-none hover:bg-zinc-700 rounded-lg group-open:rounded-b-none group-open:border-b group-open:border-zinc-700 transition-colors">
                      <span className="text-sm text-zinc-300 truncate">{faq.question.trim() || `FAQ #${i + 1}`}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={(e) => { e.preventDefault(); removeFaq(i) }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                        <span className="text-zinc-500 text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                      </div>
                    </summary>
                    <div className="px-4 py-3 space-y-2">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Question</label>
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) => updateFaq(i, 'question', e.target.value)}
                          placeholder="e.g. Is this exchange regulated?"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Answer</label>
                        <textarea
                          value={faq.answer}
                          onChange={(e) => updateFaq(i, 'answer', e.target.value)}
                          rows={3}
                          placeholder="Paste or type the answer here…"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
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
                    setPros([])
                    setCons([])
                    setFaqs([])
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
