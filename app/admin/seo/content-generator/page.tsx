'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Step = 'input' | 'outline' | 'article'

export default function ContentGeneratorPage() {
  const router = useRouter()

  // Input state
  const [keyword, setKeyword] = useState('')
  const [intent, setIntent] = useState('review')
  const [weaknesses, setWeaknesses] = useState('')

  // Outline state
  const [outline, setOutline] = useState('')
  const [outlineLoading, setOutlineLoading] = useState(false)

  // Article state
  const [article, setArticle] = useState('')
  const [articleLoading, setArticleLoading] = useState(false)

  const [step, setStep] = useState<Step>('input')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const articleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })

    // Pre-fill from keyword analysis if available
    const saved = localStorage.getItem('seo_keyword_analysis')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.keyword) setKeyword(data.keyword)
        // Parse intent from markdown analysis
        if (data.analysis) {
          const intentMatch = data.analysis.match(/## Search Intent\n([^\n]+)/)
          if (intentMatch) {
            const raw = intentMatch[1].toLowerCase()
            if (raw.includes('comparison')) setIntent('comparison')
            else if (raw.includes('informational')) setIntent('informational')
            else if (raw.includes('hybrid')) setIntent('hybrid')
            else setIntent('review')
          }
          // Parse weaknesses from markdown
          const weakMatch = data.analysis.match(/## SERP Weaknesses\n([\s\S]*?)(?=\n## |$)/)
          if (weakMatch) {
            const lines = weakMatch[1].trim().split('\n').filter((l: string) => l.trim().startsWith('-')).map((l: string) => l.replace(/^-\s*/, '').trim())
            if (lines.length) setWeaknesses(lines.join('\n'))
          }
        }
      } catch {}
    }

    const savedOutline = localStorage.getItem('seo_outline')
    if (savedOutline) { setOutline(savedOutline); setStep('outline') }
  }, [router])

  async function generateOutline() {
    setError('')
    setOutlineLoading(true)
    try {
      const weaksArr = weaknesses.split('\n').map(w => w.trim()).filter(Boolean)
      const res = await fetch('/api/admin/seo/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, intent, weaknesses: weaksArr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Outline generation failed')
      setOutline(data.outline)
      localStorage.setItem('seo_outline', data.outline)
      setStep('outline')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setOutlineLoading(false)
    }
  }

  async function generateArticle() {
    setError('')
    setArticleLoading(true)
    setArticle('')
    setStep('article')

    try {
      const res = await fetch('/api/admin/seo/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, outline, intent }),
      })
      if (!res.ok || !res.body) throw new Error('Content generation failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setArticle(text)
      }

      localStorage.setItem('seo_article', text)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setArticleLoading(false)
    }
  }

  function copyArticle() {
    navigator.clipboard.writeText(article)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">✍️ Content Generator</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
          {['input', 'outline', 'article'].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-zinc-700">→</span>}
              <span className={step === s ? 'text-blue-400 font-medium' : step > s ? 'text-zinc-400' : 'text-zinc-600'}>
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </span>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>
        )}

        {/* Step 1: Input */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">1. Input</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Keyword *</label>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="e.g. bingx review"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Intent</label>
              <select value={intent} onChange={e => setIntent(e.target.value)} className={inputClass}>
                <option value="review">Review</option>
                <option value="comparison">Comparison</option>
                <option value="informational">Informational</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Weaknesses to exploit <span className="text-zinc-600">(one per line — pre-filled from analysis if available)</span>
              </label>
              <textarea
                value={weaknesses}
                onChange={e => setWeaknesses(e.target.value)}
                rows={5}
                placeholder="No real user experience sections&#10;Weak or generic verdicts&#10;Outdated fee information"
                className={`${inputClass} font-mono`}
              />
            </div>
            <button
              onClick={generateOutline}
              disabled={outlineLoading || !keyword.trim()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm"
            >
              {outlineLoading ? 'Generating outline…' : 'Generate Outline →'}
            </button>
          </div>
        </div>

        {/* Step 2: Outline */}
        {(step === 'outline' || step === 'article') && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">2. Outline</h2>
              <span className="text-xs text-zinc-500">Edit before generating</span>
            </div>
            <textarea
              value={outline}
              onChange={e => { setOutline(e.target.value); localStorage.setItem('seo_outline', e.target.value) }}
              rows={16}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={generateArticle}
                disabled={articleLoading || !outline.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm"
              >
                {articleLoading ? 'Writing article…' : 'Generate Full Article →'}
              </button>
              <button
                onClick={generateOutline}
                disabled={outlineLoading}
                className="px-5 py-2 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 text-sm"
              >
                {outlineLoading ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Article */}
        {step === 'article' && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">3. Article</h2>
              <div className="flex gap-2">
                {article && !articleLoading && (
                  <>
                    <button
                      onClick={copyArticle}
                      className="px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-600 text-xs font-medium"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                    <Link
                      href="/admin/seo/content-optimizer"
                      onClick={() => localStorage.setItem('seo_optimize_content', article)}
                      className="px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 text-xs"
                    >
                      Optimize →
                    </Link>
                  </>
                )}
              </div>
            </div>

            {articleLoading && !article && (
              <div className="text-center py-8 text-zinc-500 text-sm">Writing article…</div>
            )}

            {article && (
              <textarea
                ref={articleRef}
                value={article}
                onChange={e => setArticle(e.target.value)}
                rows={40}
                className={`${inputClass} font-mono text-xs leading-relaxed`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
