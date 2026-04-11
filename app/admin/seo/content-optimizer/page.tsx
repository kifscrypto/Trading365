'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

type Tab = 'compress' | 'links' | 'audit'
type LoadingState = 'idle' | 'loading' | 'done' | 'error'

function AuditMarkdown({ text }: { text: string }) {
  const scoreMatch = text.match(/## Overall Score:\s*(\d+)\s*\/\s*100/)
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null

  function parseSection(heading: string): string[] {
    const re = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`)
    const m = text.match(re)
    if (!m) return []
    return m[1].trim().split('\n').filter(l => l.trim()).map(l => l.replace(/^[-\d.]\s*/, '').trim()).filter(Boolean)
  }

  const priorities = parseSection('Top 3 Priority Actions')
  const weaknesses = parseSection('Key Weaknesses')
  const compression = parseSection('Compression Summary')
  const linking = parseSection('Internal Linking Gaps')

  return (
    <div className="space-y-5">
      {/* Score */}
      {score !== null && (
        <div className="flex items-center gap-4 pb-4 border-b border-zinc-700">
          <div className={`text-5xl font-bold ${score >= 75 ? 'text-green-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {score}
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-100">/ 100</p>
            <p className="text-xs text-zinc-500 mt-0.5">Ranking + conversion score</p>
          </div>
        </div>
      )}

      {/* Priority Actions */}
      {priorities.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">🎯 Top 3 Priority Actions</h3>
          <ol className="space-y-2">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg">
                <span className="text-blue-400 font-bold shrink-0 text-sm">{i + 1}.</span>
                <span className="text-sm text-zinc-200">{p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚔️ Key Weaknesses</h3>
          <ul className="space-y-1.5">
            {weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-red-500 shrink-0 mt-0.5">→</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compression */}
      {compression.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">✂️ Compression Summary</h3>
          <ul className="space-y-1.5">
            {compression.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-amber-400 shrink-0 mt-0.5">→</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Linking Gaps */}
      {linking.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">🔗 Internal Linking Gaps</h3>
          <ul className="space-y-1.5">
            {linking.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LinkingMarkdown({ text }: { text: string }) {
  // Split into "Internal Link Opportunities" and "End of Article Links" sections
  const oppMatch = text.match(/## Internal Link Opportunities\n([\s\S]*?)(?=\n## |$)/)
  const endMatch = text.match(/## End of Article Links\n([\s\S]*?)(?=\n## |$)/)

  const oppBlocks = oppMatch
    ? oppMatch[1].trim().split(/(?=\n\d+\.\s+\*\*)/).filter(Boolean)
    : []

  const endLinks = endMatch
    ? endMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim())
    : []

  if (!oppBlocks.length && !endLinks.length) {
    return <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{text.trim()}</pre>
  }

  return (
    <div className="space-y-4">
      {oppBlocks.length > 0 && (
        <div className="space-y-3">
          {oppBlocks.map((block, i) => {
            const titleMatch = block.match(/\*\*(.+?)\*\*/)
            const title = titleMatch?.[1] ?? `Link ${i + 1}`
            const anchorMatch = block.match(/Anchor:\s*"?([^"\n]+)"?/)
            const linkMatch = block.match(/Link to:\s*([^\n]+)/)
            const reasonMatch = block.match(/Reason:\s*([^\n]+)/)
            return (
              <div key={i} className="border border-zinc-700 rounded-lg overflow-hidden">
                <div className="bg-zinc-800 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-400">{i + 1}</span>
                  <span className="text-sm font-semibold text-zinc-100">{title}</span>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {anchorMatch && (
                    <div className="flex gap-2 text-sm">
                      <span className="text-zinc-500 shrink-0 w-20">Anchor:</span>
                      <span className="text-blue-300 font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded">"{anchorMatch[1].trim()}"</span>
                    </div>
                  )}
                  {linkMatch && (
                    <div className="flex gap-2 text-sm">
                      <span className="text-zinc-500 shrink-0 w-20">Link to:</span>
                      <span className="text-zinc-300 font-mono text-xs">{linkMatch[1].trim()}</span>
                    </div>
                  )}
                  {reasonMatch && (
                    <div className="flex gap-2 text-sm">
                      <span className="text-amber-400 shrink-0 w-20 font-medium">Reason:</span>
                      <span className="text-zinc-300">{reasonMatch[1].trim()}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {endLinks.length > 0 && (
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          <div className="bg-zinc-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-zinc-100">End of Article Links</span>
          </div>
          <ul className="px-4 py-3 space-y-1.5">
            {endLinks.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-blue-400 shrink-0">→</span>
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CompressionMarkdown({ text }: { text: string }) {
  // Split on numbered items: "1. **Title**"
  const blocks = text.split(/(?=\n\d+\.\s+\*\*)/).filter(Boolean)
  if (blocks.length <= 1) {
    return <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{text.trim()}</pre>
  }
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const titleMatch = block.match(/\*\*(.+?)\*\*/)
        const title = titleMatch?.[1] ?? `Item ${i + 1}`
        const bullets = block
          .split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^[\s-]+/, '').trim())
        return (
          <div key={i} className="border border-zinc-700 rounded-lg overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400">{i + 1}</span>
              <span className="text-sm font-semibold text-zinc-100">{title}</span>
            </div>
            {bullets.length > 0 && (
              <ul className="px-4 py-3 space-y-1.5">
                {bullets.map((b, j) => {
                  const isReduce = b.toLowerCase().startsWith('can reduce')
                  const isIssue = b.toLowerCase().startsWith('issue')
                  const isFix = b.toLowerCase().startsWith('fix') || b.toLowerCase().startsWith('keep')
                  return (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <span className={`shrink-0 mt-0.5 ${isFix ? 'text-amber-400' : isIssue ? 'text-red-400' : 'text-zinc-500'}`}>→</span>
                      <span className={isFix ? 'text-zinc-200' : 'text-zinc-400'}>{b}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ContentOptimizerInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tab, setTab] = useState<Tab>(searchParams.get('mode') === 'existing' ? 'audit' : 'compress')
  const [content, setContent] = useState('')
  const [auditUrl, setAuditUrl] = useState('')
  const [compressionMarkdown, setCompressionMarkdown] = useState<string>('')
  const [linkingMarkdown, setLinkingMarkdown] = useState<string>('')
  const [auditMarkdown, setAuditMarkdown] = useState<string>('')
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
    setCompressionMarkdown('')
    setLinkingMarkdown('')

    try {
      const res = await fetch('/api/admin/seo/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mode }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300) || 'Server error') }
      if (!res.ok) throw new Error(data.error ?? 'Optimization failed')
      if (data.compressionMarkdown) setCompressionMarkdown(data.compressionMarkdown)
      if (data.linkingMarkdown) setLinkingMarkdown(data.linkingMarkdown)
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
    setAuditMarkdown('')

    try {
      const res = await fetch('/api/admin/seo/analyze-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), url: auditUrl.trim() }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300) || 'Server error') }
      if (!res.ok) throw new Error(data.error ?? 'Audit failed')
      setAuditMarkdown(data.analysis ?? '')
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

            {compressionMarkdown && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">✂️ Compression Opportunities</h3>
                <CompressionMarkdown text={compressionMarkdown} />
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

            {linkingMarkdown && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">🔗 Internal Link Opportunities</h3>
                <LinkingMarkdown text={linkingMarkdown} />
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

            {auditMarkdown && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                <AuditMarkdown text={auditMarkdown} />
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
