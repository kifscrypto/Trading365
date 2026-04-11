'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ArticleStatus = 'has' | 'missing' | 'generating' | 'done' | 'skipped' | 'error'

interface ArticleRow {
  id: number
  title: string
  slug: string
  category_slug: string
  content: string
  status: ArticleStatus
  errorMsg?: string
}

export default function OurExperiencePage() {
  const router = useRouter()
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'missing' | 'has'>('missing')
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const cancelRef = useRef(false)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    loadArticles()
  }, [router])

  async function loadArticles() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/articles')
      const data: any[] = await res.json()
      const rows: ArticleRow[] = data
        .filter(a => a.published)
        .map(a => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          category_slug: a.category_slug,
          content: a.content ?? '',
          status: (a.content ?? '').toLowerCase().includes('our experience') ? 'has' : 'missing',
        }))
        .sort((a, b) => {
          // Missing first, then alphabetical
          if (a.status === 'missing' && b.status !== 'missing') return -1
          if (a.status !== 'missing' && b.status === 'missing') return 1
          return a.title.localeCompare(b.title)
        })
      setArticles(rows)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function generateForArticle(id: number) {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, status: 'generating', errorMsg: undefined } : a))
    try {
      const res = await fetch('/api/admin/seo/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setArticles(prev => prev.map(a =>
        a.id === id ? { ...a, status: data.skipped ? 'skipped' : 'done' } : a
      ))
    } catch (err: any) {
      setArticles(prev => prev.map(a =>
        a.id === id ? { ...a, status: 'error', errorMsg: err.message } : a
      ))
    }
  }

  async function handleGenerateAll() {
    const targets = articles.filter(a => a.status === 'missing')
    if (!targets.length) return
    setBulkRunning(true)
    cancelRef.current = false
    setBulkProgress({ current: 0, total: targets.length })

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break
      setBulkProgress({ current: i + 1, total: targets.length })
      await generateForArticle(targets[i].id)
    }

    setBulkRunning(false)
  }

  const filtered = articles.filter(a => {
    if (filter === 'missing') return ['missing', 'generating', 'error'].includes(a.status)
    if (filter === 'has') return ['has', 'done', 'skipped'].includes(a.status)
    return true
  })

  const missingCount = articles.filter(a => a.status === 'missing').length
  const hasCount = articles.filter(a => ['has', 'done'].includes(a.status)).length
  const skippedCount = articles.filter(a => a.status === 'skipped').length

  const statusBadge = (a: ArticleRow) => {
    switch (a.status) {
      case 'has':
        return <span className="text-xs px-2 py-0.5 bg-green-900/40 border border-green-700/50 text-green-400 rounded-full">✓ Has section</span>
      case 'missing':
        return <span className="text-xs px-2 py-0.5 bg-red-900/30 border border-red-700/50 text-red-400 rounded-full">✗ Missing</span>
      case 'generating':
        return <span className="text-xs px-2 py-0.5 bg-amber-900/30 border border-amber-700/50 text-amber-400 rounded-full animate-pulse">Generating…</span>
      case 'done':
        return <span className="text-xs px-2 py-0.5 bg-green-900/40 border border-green-700/50 text-green-400 rounded-full">✓ Generated</span>
      case 'skipped':
        return <span className="text-xs px-2 py-0.5 bg-zinc-800 border border-zinc-600 text-zinc-400 rounded-full">– Skipped</span>
      case 'error':
        return <span className="text-xs px-2 py-0.5 bg-red-900/30 border border-red-700 text-red-400 rounded-full" title={a.errorMsg}>✗ Error</span>
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">📝 Our Experience Audit</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Summary */}
        <div className="flex items-center gap-6 mb-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{hasCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Have section</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{missingCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Missing</p>
          </div>
          {skippedCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-500">{skippedCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Skipped (not applicable)</p>
            </div>
          )}

          <div className="ml-auto flex gap-3 items-center">
            {bulkRunning && (
              <div className="text-xs text-zinc-400">
                {bulkProgress.current}/{bulkProgress.total}
                <button
                  onClick={() => { cancelRef.current = true }}
                  className="ml-2 text-red-400 hover:text-red-300"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={handleGenerateAll}
              disabled={bulkRunning || missingCount === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm whitespace-nowrap"
            >
              {bulkRunning
                ? `Generating ${bulkProgress.current}/${bulkProgress.total}…`
                : `Generate All Missing (${missingCount})`}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-700 rounded-lg p-1 mb-4 w-fit">
          {(['missing', 'all', 'has'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f === 'missing' ? 'Missing' : f === 'has' ? 'Done' : 'All'}
            </button>
          ))}
        </div>

        {/* Article list */}
        {loading ? (
          <div className="text-center py-12 text-zinc-600">Loading articles…</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-zinc-600 text-sm">No articles in this view.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Article</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-36">Status</th>
                    <th className="px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <tr key={a.id} className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? '' : 'bg-zinc-900/50'}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm text-zinc-200 font-medium leading-tight">{a.title}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">/{a.category_slug}/{a.slug}</p>
                        {a.errorMsg && <p className="text-xs text-red-400 mt-0.5">{a.errorMsg}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(a)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(a.status === 'missing' || a.status === 'error') && (
                          <button
                            onClick={() => generateForArticle(a.id)}
                            disabled={bulkRunning}
                            className="px-3 py-1.5 bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 rounded text-xs font-medium disabled:opacity-40"
                          >
                            Generate
                          </button>
                        )}
                        {a.status === 'generating' && (
                          <span className="text-xs text-zinc-500 animate-pulse">Working…</span>
                        )}
                        {(a.status === 'done' || a.status === 'has') && (
                          <a
                            href={`https://trading365.org/${a.category_slug}/${a.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-zinc-500 hover:text-zinc-300"
                          >
                            View →
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-600">
          Guides, educational articles, and roundups are automatically skipped — Claude identifies which articles need the section.
        </p>
      </div>
    </div>
  )
}
