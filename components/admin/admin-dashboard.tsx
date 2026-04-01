'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboard({ initialArticles }: { initialArticles: any[] }) {
  const router = useRouter()
  const [articles, setArticles] = useState(initialArticles)
  const [search, setSearch] = useState('')

  const filtered = articles.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.slug.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(slug: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/admin/articles/${slug}`, { method: 'DELETE' })
      if (res.ok) {
        setArticles(articles.filter((a) => a.slug !== slug))
      }
    } catch (error) {
      alert('Failed to delete article')
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Articles</h1>
        <p className="text-slate-600">{articles.length} total articles</p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Category</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Rating</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Date</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  {search ? 'No articles match your search' : 'No articles found'}
                </td>
              </tr>
            ) : (
              filtered.map((article) => (
                <tr key={article.slug} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{article.title}</p>
                    <p className="text-sm text-slate-500 font-mono">{article.slug}</p>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{article.category}</td>
                  <td className="px-6 py-3 text-slate-600">{article.rating ? `${article.rating}/10` : '—'}</td>
                  <td className="px-6 py-3 text-slate-600">{article.date}</td>
                  <td className="px-6 py-3 text-right space-x-2">
                    <Link
                      href={`/admin/article/${article.slug}`}
                      className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(article.slug, article.title)}
                      className="inline-block px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
