'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

type Tab = 'compress' | 'links' | 'audit'
type LoadingState = 'idle' | 'loading' | 'done' | 'error'

function ContentOptimizerInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tab, setTab] = useState<Tab>(searchParams.get('mode') === 'existing' ? 'audit' : 'compress')
  const [content, setContent] = useState('')
  const [auditUrl, setAuditUrl] = useState('')
  const [compressionSuggestions, setCompressionSuggestions] = useState<string[]>([])
  const [linkingSuggestions, setLinkingSuggestions] = useState<string[]>([])
  const [auditResult, setAuditResult] = useState<{
    overall_score?: number
    priority_actions?: string[]
    weaknesses?: string[]
    compression_suggestions?: string[]
    linking_suggestions?: string[]
  } | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    const saved = localStorage.getItem('seo_optimize_content')
    if (saved) { setContent(saved); localStorage.removeItem('seo_optimize_content') }
  }, [router])

  async function runOptimize(mode: 'compress' | 'links' | 'both') {
    if (!content.trim()) { setError('Paste article content first'); return }
    setError('')
    setLoadingState('loading')
    setCompressionSuggestions([])
    setLinkingSuggestions([])

    try {
      const res = await fetch('/api/admin/seo/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Optimization failed')
      if (data.compressionSuggestions) setCompressionSuggestions(data.compressionSuggestions)
      if (data.linkingSuggestions) setLinkingSuggestions(data.linkingSuggestions)
      setLoadingState('done')
    } catch (err: any) {
      setError(err.message)
      setLoadingState('error')
    }
  }

  async function runAudit() {
    if (!content.trim() && !auditUrl.trim()) { setError('Paste content or enter a URL'); return }
    setError('')
    setLoadingState('loading')
    setAuditResult(null)

    try {
      const res = await fetch('/api/admin/seo/analyze-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), url: auditUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Audit failed')
      setAuditResult(data)
      setLoadingState('done')
    } catch (err: any) {
      setError(err.message)
      setLoadingState('error')
    }
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: 'compress', label: 'Compression', emoji: '✂️' },
    { id: 'links', label: 'Internal Links', emoji: '🔗' },
    { id: 'audit', label: 'Full Audit', emoji: '🔄' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">✂️ Content Optimizer</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-700 rounded-lg p-1 mb-6 w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(''); setLoadingState('idle') }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>
        )}

        {/* Compress tab */}
        {tab === 'compress' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
              <label className="block text-xs text-zinc-400 mb-2">Article content</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={12}
                placeholder="Paste your article here…"
                className={`${inputClass} font-mono text-xs`}
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => runOptimize('compress')}
                  disabled={loadingState === 'loading' || !content.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm"
                >
                  {loadingState === 'loading' ? 'Analyzing…' : 'Find Compression Opportunities'}
                </button>
              </div>
            </div>

            {compressionSuggestions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  ✂️ {compressionSuggestions.length} Compression Suggestions
                </h3>
                <ul className="space-y-3">
                  {compressionSuggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg">
                      <span className="text-amber-400 mt-0.5 shrink-0 text-xs font-bold">→</span>
                      <span className="text-sm text-zinc-300 leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Links tab */}
        {tab === 'links' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
              <label className="block text-xs text-zinc-400 mb-2">Article content</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={12}
                placeholder="Paste your article here…"
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="mt-2 text-xs text-zinc-600">Site pages are loaded automatically from the database.</p>
              <div className="mt-4">
                <button
                  onClick={() => runOptimize('links')}
                  disabled={loadingState === 'loading' || !content.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm"
                >
                  {loadingState === 'loading' ? 'Analyzing…' : 'Generate Link Suggestions'}
                </button>
              </div>
            </div>

            {linkingSuggestions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  🔗 {linkingSuggestions.length} Link Suggestions
                </h3>
                <ul className="space-y-3">
                  {linkingSuggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg">
                      <span className="text-blue-400 mt-0.5 shrink-0 text-xs font-bold">→</span>
                      <span className="text-sm text-zinc-300 leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Full Audit tab */}
        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Paste article content</label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={10}
                    placeholder="Paste article text here…"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-700" />
                  <span className="text-xs text-zinc-500">or</span>
                  <div className="flex-1 h-px bg-zinc-700" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Fetch from URL</label>
                  <input
                    type="url"
                    value={auditUrl}
                    onChange={e => setAuditUrl(e.target.value)}
                    placeholder="https://trading365.org/reviews/mexc-review"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={runAudit}
                  disabled={loadingState === 'loading' || (!content.trim() && !auditUrl.trim())}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm"
                >
                  {loadingState === 'loading' ? 'Auditing…' : 'Run Full Audit'}
                </button>
              </div>
            </div>

            {auditResult && (
              <div className="space-y-4">
                {/* Score + Priority */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex items-center gap-4">
                    <div className={`text-4xl font-bold ${
                      (auditResult.overall_score ?? 0) >= 75 ? 'text-green-400' :
                      (auditResult.overall_score ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {auditResult.overall_score ?? '—'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">Content Score</p>
                      <p className="text-xs text-zinc-500">Quality, specificity, decision-clarity</p>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">🎯 Priority Actions</h3>
                    <ol className="space-y-1.5">
                      {auditResult.priority_actions?.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                          {a}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Weaknesses */}
                {auditResult.weaknesses?.length ? (
                  <div className="bg-zinc-900 border border-red-900/40 rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚔️ Content Weaknesses</h3>
                    <ul className="space-y-2">
                      {auditResult.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="text-red-500 shrink-0 mt-0.5">→</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Compression */}
                {auditResult.compression_suggestions?.length ? (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">✂️ Compression Suggestions</h3>
                    <ul className="space-y-2">
                      {auditResult.compression_suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300 p-2 bg-zinc-800/50 rounded">
                          <span className="text-amber-400 shrink-0 mt-0.5">→</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Linking */}
                {auditResult.linking_suggestions?.length ? (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">🔗 Linking Suggestions</h3>
                    <ul className="space-y-2">
                      {auditResult.linking_suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300 p-2 bg-zinc-800/50 rounded">
                          <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ContentOptimizerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">Loading…</div>}>
      <ContentOptimizerInner />
    </Suspense>
  )
}
