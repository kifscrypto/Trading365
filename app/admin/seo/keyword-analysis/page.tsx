'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SerpResult } from '@/lib/seo/scraper'

interface Analysis {
  keyword: string
  intent: string
  what_google_rewards: string
  weaknesses: string[]
  content_patterns: {
    dominant_type: string
    typical_length: string
    common_sections: string[]
  }
  serpResults: SerpResult[]
  hasSerpData: boolean
}

const INTENT_COLORS: Record<string, string> = {
  review: 'bg-blue-900/50 text-blue-300 border-blue-700',
  comparison: 'bg-purple-900/50 text-purple-300 border-purple-700',
  informational: 'bg-green-900/50 text-green-300 border-green-700',
  hybrid: 'bg-amber-900/50 text-amber-300 border-amber-700',
}

export default function KeywordAnalysisPage() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    const saved = localStorage.getItem('seo_keyword_analysis')
    if (saved) { try { setAnalysis(JSON.parse(saved)) } catch {} }
  }, [router])

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!keyword.trim()) return
    setLoading(true)
    setError('')
    setAnalysis(null)

    try {
      const res = await fetch('/api/admin/seo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setAnalysis(data)
      localStorage.setItem('seo_keyword_analysis', JSON.stringify(data))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">🔍 Keyword + Intent Analysis</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Input */}
        <form onSubmit={handleAnalyze} className="flex gap-3 mb-8">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="e.g. bingx review, best no-kyc exchange, mexc vs binance"
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !keyword.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm whitespace-nowrap"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>
        )}

        {loading && (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-4xl mb-3">🔍</div>
            <p>Scraping SERPs and analyzing with Claude…</p>
            <p className="text-xs mt-1 text-zinc-600">This takes 10–20 seconds</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-6">
            {/* Header row */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-zinc-100">"{analysis.keyword}"</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${INTENT_COLORS[analysis.intent] ?? 'bg-zinc-800 text-zinc-300 border-zinc-600'}`}>
                {analysis.intent}
              </span>
              {!analysis.hasSerpData && (
                <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-700 rounded text-xs">
                  No live SERP — Claude knowledge used
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* What Google rewards */}
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What Google Is Rewarding</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{analysis.what_google_rewards}</p>
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-2">Content patterns</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded">{analysis.content_patterns?.dominant_type}</span>
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded">{analysis.content_patterns?.typical_length}</span>
                  </div>
                  {analysis.content_patterns?.common_sections?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {analysis.content_patterns.common_sections.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-800/50 text-zinc-500 text-xs rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Weaknesses */}
              <div className="bg-zinc-900 border border-red-900/40 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚔️ Weaknesses to Exploit</h3>
                <ul className="space-y-2">
                  {analysis.weaknesses?.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-red-500 mt-0.5 shrink-0">→</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* SERP Results */}
            {analysis.serpResults?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Top {analysis.serpResults.length} Results</h3>
                <div className="space-y-3">
                  {analysis.serpResults.map((r) => (
                    <div key={r.position} className="flex items-start gap-3">
                      <span className="text-xs text-zinc-600 w-5 shrink-0 pt-0.5">#{r.position}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 font-medium leading-tight">{r.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{r.url}</p>
                        {r.snippet && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{r.snippet}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-3 pt-2">
              <Link
                href="/admin/seo/content-generator"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                Continue to Content Generator →
              </Link>
              <button
                onClick={() => { setAnalysis(null); setKeyword(''); localStorage.removeItem('seo_keyword_analysis') }}
                className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
