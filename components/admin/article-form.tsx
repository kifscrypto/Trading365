'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { categories } from '@/lib/data/categories'

export default function ArticleForm({ article }: { article?: any }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [thumbnailPreview, setThumbnailPreview] = useState<string>(article?.thumbnail || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    title: article?.title || '',
    slug: article?.slug || '',
    excerpt: article?.excerpt || '',
    content: article?.content || '',
    category: article?.category || '',
    category_slug: article?.category_slug || '',
    date: article?.date || new Date().toISOString().split('T')[0],
    author: article?.author || '',
    rating: article?.rating || '',
    read_time: article?.read_time || '',
    thumbnail: article?.thumbnail || '',
    tags: Array.isArray(article?.tags) ? article.tags.join(', ') : '',
    meta_title: article?.meta_title || '',
    meta_description: article?.meta_description || '',
    meta_keywords: article?.meta_keywords || '',
  })

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = categories.find((c) => c.slug === e.target.value)
    setFormData({
      ...formData,
      category: selected?.title || '',
      category_slug: selected?.slug || '',
    })
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = (evt) => setThumbnailPreview(evt.target?.result as string)
    reader.readAsDataURL(file)

    setImageUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (imageUploading) return
    setLoading(true)

    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        rating: formData.rating ? parseFloat(formData.rating) : null,
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        meta_keywords: formData.meta_keywords || null,
      }

      if (article) {
        const res = await fetch(`/api/admin/articles/${article.slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, new_slug: formData.slug }),
        })
        if (res.ok) router.push('/admin/dashboard')
        else alert('Failed to update article')
      } else {
        const res = await fetch('/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) router.push('/admin/dashboard')
        else alert('Failed to create article')
      }
    } catch (error) {
      alert('Failed to save article')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none'

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{article ? 'Edit Article' : 'New Article'}</h1>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Basic Info */}
        <section className="bg-white rounded-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Basic Info</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Slug *</label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
              <select
                required
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Author</label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Rating (0–10)</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Read Time</label>
              <input
                type="text"
                placeholder="e.g., 5 min"
                value={formData.read_time}
                onChange={(e) => setFormData({ ...formData, read_time: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tags (comma separated)</label>
              <input
                type="text"
                placeholder="tag1, tag2, tag3"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Excerpt</label>
            <textarea
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              rows={3}
              className={inputClass}
            />
          </div>
        </section>

        {/* Featured Image */}
        <section className="bg-white rounded-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Featured Image</h2>
          <div className="flex gap-6 items-start">
            {thumbnailPreview ? (
              <img
                src={thumbnailPreview}
                alt="Thumbnail preview"
                className="w-40 h-28 object-cover rounded-lg border border-slate-200"
              />
            ) : (
              <div className="w-40 h-28 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 text-sm">
                No image
              </div>
            )}
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50"
              >
                {imageUploading ? 'Uploading…' : thumbnailPreview ? 'Replace Image' : 'Upload Image'}
              </button>
              <p className="mt-2 text-sm text-slate-500">Max 5MB. JPG, PNG, WebP accepted.</p>
              {formData.thumbnail && (
                <p className="mt-1 text-xs text-slate-400 break-all">{formData.thumbnail}</p>
              )}
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="bg-white rounded-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Content</h2>
          <textarea
            required
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            rows={20}
            className={`${inputClass} font-mono text-sm`}
          />
        </section>

        {/* SEO */}
        <section className="bg-white rounded-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">SEO</h2>
          <p className="text-sm text-slate-500 mb-6">Leave blank to use the article title and excerpt as defaults.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Meta Title</label>
              <input
                type="text"
                maxLength={60}
                placeholder="Defaults to article title"
                value={formData.meta_title}
                onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-400">{formData.meta_title.length}/60 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Meta Description</label>
              <textarea
                maxLength={160}
                rows={3}
                placeholder="Defaults to excerpt"
                value={formData.meta_description}
                onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-400">{formData.meta_description.length}/160 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Meta Keywords</label>
              <input
                type="text"
                placeholder="keyword1, keyword2, keyword3"
                value={formData.meta_keywords}
                onChange={(e) => setFormData({ ...formData, meta_keywords: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <div className="flex gap-4 pb-8">
          <button
            type="submit"
            disabled={loading || imageUploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 font-medium"
          >
            {loading ? 'Saving…' : article ? 'Update Article' : 'Create Article'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
