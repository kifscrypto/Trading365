'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SerpResult } from '@/lib/seo/scraper'

interface Analysis {
  keyword: string
  analysis: string
  serpResults: SerpResult[]
  hasSerpData: boolean
}

function renderWeaknessMarkdown(text: string) {
  // Split on numbered weakness blocks: "1. **Title**"
  const blocks = text.split(/(?=\n\d+\.\s+\*\*)/).filter(Boolean)
  if (blocks.length <= 1) {
    // Fallback: render as plain text
    return <p className="text-sm text-zinc-300 whitespace-pre-wrap">{text.trim()}</p>
  }
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        const titleMatch = block.match(/\*\*(.+?)\*\*/)
        const title = titleMatch?.[1] ?? `Weakness ${i + 1}`
        const wrongMatch = block.match(/What's wrong:\s*([^\n]+)/)
        const mattersMatch = block.match(/Why it matters:\s*([^\n]+)/)
        const exploitMatch = block.match(/How to exploit it:\s*([^\n]+)/)
        return (
          <div key={i} className="border border-zinc-700 rounded-lg overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs font-bold text-red-400">{i + 1}</span>
              <span className="text-sm font-semibold text-zinc-100">{title}</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {wrongMatch && (
                <div className="flex gap-2 text-sm">
                  <span className="text-zinc-500 shrink-0 w-28">What&apos;s wrong:</span>
                  <span className="text-zinc-300">{wrongMatch[1].trim()}</span>
                </div>
              )}
              {mattersMatch && (
                <div className="flex gap-2 text-sm">
                  <span className="text-zinc-500 shrink-0 w-28">Why it matters:</span>
                  <span className="text-zinc-300">{mattersMatch[1].trim()}</span>
                </div>
              )}
              {exploitMatch && (
                <div className="flex gap-2 text-sm">
                  <span className="text-amber-400 shrink-0 w-28 font-medium">How to exploit:</span>
                  <span className="text-zinc-200">{exploitMatch[1].trim()}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function parseSection(text: string, heading: string): string[] | string | null {
  if (!text || typeof text !== 'string') return null
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`)
  const match = text.match(regex)
  if (!match) return null
  const body = match[1].trim()
  if (body.startsWith('-')) {
    return body.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim())
  }
  return body
}

function AnalysisSection({ title, content, accent }: { title: string; content: string[] | string | null; accent?: string }) {
  if (!content) return null
  return (
    <div className={`bg-zinc-900 border rounded-xl p-5 ${accent ?? 'border-zinc-700'}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${accent === 'border-red-900/50' ? 'text-red-400' : accent === 'border-blue-900/50' ? 'text-blue-400' : 'text-zinc-400'}`}>
        {title}
      </h3>
      {Array.isArray(content) ? (
        <ul className="space-y-2">
          {content.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className={`mt-0.5 shrink-0 ${accent === 'border-red-900/50' ? 'text-red-500' : 'text-zinc-500'}`}>→</span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-300 leading-relaxed">{content}</p>
      )}
    </div>
  )
}

export default function KeywordAnalysisPage() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [deepWeakness, setDeepWeakness] = useState<string | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)
  const [deepError, setDeepError] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    const saved = localStorage.getItem('seo_keyword_analysis')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate format — analysis must be a string (not old JSON object format)
        if (parsed && typeof parsed.analysis === 'string') {
          setAnalysis(parsed)
        } else {
          localStorage.removeItem('seo_keyword_analysis')
        }
      } catch {}
    }
  }, [router])

  async function handleDeepWeakness() {
    if (!analysis) return
    setDeepLoading(true)
    setDeepError('')
    setDeepWeakness(null)
    try {
      const res = await fetch('/api/admin/seo/weaknesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: analysis.keyword, serpResults: analysis.serpResults }),
      })
      const text = await res.text()
      let data: { analysis?: string; error?: string }
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300) || 'Server error') }
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setDeepWeakness(data.analysis ?? '')
    } catch (err: any) {
      setDeepError(err.message)
    } finally {
      setDeepLoading(false)
    }
  }

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
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300) || 'Server error') }
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setAnalysis(data)
      localStorage.setItem('seo_keyword_analysis', JSON.stringify(data))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const intent = analysis ? parseSection(analysis.analysis, 'Search Intent') : null
  const rewards = analysis ? parseSection(analysis.analysis, 'What Google Rewards') : null
  const patterns = analysis ? parseSection(analysis.analysis, 'Top Ranking Patterns') : null
  const weaknesses = analysis ? parseSection(analysis.analysis, 'SERP Weaknesses') : null
  const strategy = analysis ? parseSection(analysis.analysis, 'Recommended Strategy') : null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">🔍 Keyword + Intent Analysis</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
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
            <p>Scraping SERPs and analyzing…</p>
            <p className="text-xs mt-1 text-zinc-600">Takes 10–20 seconds</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-xl font-bold text-zinc-100">"{analysis.keyword}"</h2>
              {!analysis.hasSerpData && (
                <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-700 rounded text-xs">
                  No live SERP — Claude knowledge used
                </span>
              )}
            </div>

            {/* Intent — inline pill */}
            {intent && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Search Intent</span>
                <span className="px-3 py-1 bg-blue-900/50 border border-blue-700 text-blue-300 rounded-full text-sm font-medium">
                  {typeof intent === 'string' ? intent : intent[0]}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnalysisSection title="What Google Rewards" content={rewards} />
              <AnalysisSection title="Top Ranking Patterns" content={patterns} />
            </div>

            <AnalysisSection title="⚔️ SERP Weaknesses" content={weaknesses} accent="border-red-900/50" />
            <AnalysisSection title="✅ Recommended Strategy" content={strategy} accent="border-blue-900/50" />

            {/* Deep Weakness Analysis */}
            <div className="bg-zinc-900 border border-red-900/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-red-400">⚔️ Deep Weakness Analysis</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Detailed breakdown — what&apos;s wrong, why it matters, how to exploit it</p>
                </div>
                <button
                  onClick={handleDeepWeakness}
                  disabled={deepLoading}
                  className="px-4 py-2 bg-red-900/50 border border-red-700 text-red-300 hover:bg-red-900 rounded-lg text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {deepLoading ? 'Analyzing…' : deepWeakness ? 'Re-run' : 'Run Deep Analysis'}
                </button>
              </div>

              {deepError && (
                <p className="text-xs text-red-400 mb-3">{deepError}</p>
              )}

              {deepLoading && (
                <div className="text-center py-6 text-zinc-600 text-sm">Running deep weakness analysis…</div>
              )}

              {deepWeakness && !deepLoading && (
                <div className="mt-2">
                  {renderWeaknessMarkdown(deepWeakness)}
                </div>
              )}

              {!deepWeakness && !deepLoading && !deepError && (
                <p className="text-xs text-zinc-600 text-center py-4">Click &ldquo;Run Deep Analysis&rdquo; to get a detailed weakness breakdown with exploitation strategies.</p>
              )}
            </div>

            {/* SERP list */}
            {analysis.serpResults?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Top {analysis.serpResults.length} Results
                </h3>
                <div className="space-y-3">
                  {analysis.serpResults.map((r) => (
                    <div key={r.position} className="flex items-start gap-3">
                      <span className="text-xs text-zinc-600 w-5 shrink-0 pt-0.5">#{r.position}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 font-medium leading-tight">{r.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{r.url}</p>
                        {r.snippet && <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{r.snippet}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
