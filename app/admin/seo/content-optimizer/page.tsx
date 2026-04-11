'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

type Tab = 'compress' | 'links' | 'audit'
type LoadingState = 'idle' | 'loading' | 'done' | 'error'

function AuditMarkdown({ text, onFix, isDone }: {
  text: string
  onFix: (fix: string) => void
  isDone: boolean
}) {
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

  const fixBtn = (label: string) => isDone ? (
    <button
      onClick={() => onFix(label)}
      className="shrink-0 px-2.5 py-1 bg-green-900/40 border border-green-700/60 text-green-400 hover:bg-green-900/70 hover:border-green-600 rounded text-xs font-medium whitespace-nowrap transition-colors"
    >
      Fix Now
    </button>
  ) : null

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
                <span className="text-blue-400 font-bold shrink-0 text-sm pt-0.5">{i + 1}.</span>
                <div className="flex-1 flex items-start justify-between gap-3 min-w-0">
                  <span className="text-sm text-zinc-200">{p}</span>
                  {fixBtn(p)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚔️ Key Weaknesses</h3>
          <ul className="space-y-2">
            {weaknesses.map((w, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30">
                <div className="flex items-start gap-2 text-sm text-zinc-300 min-w-0">
                  <span className="text-red-500 shrink-0 mt-0.5">→</span>
                  <span>{w}</span>
                </div>
                {fixBtn(w)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compression */}
      {compression.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">✂️ Compression Summary</h3>
          <ul className="space-y-2">
            {compression.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30">
                <div className="flex items-start gap-2 text-sm text-zinc-300 min-w-0">
                  <span className="text-amber-400 shrink-0 mt-0.5">→</span>
                  <span>{c}</span>
                </div>
                {fixBtn(c)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Linking Gaps */}
      {linking.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">🔗 Internal Linking Gaps</h3>
          <ul className="space-y-2">
            {linking.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30">
                <div className="flex items-start gap-2 text-sm text-zinc-300 min-w-0">
                  <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                  <span>{l}</span>
                </div>
                {fixBtn(l)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LinkingMarkdown({ text }: { text: string }) {
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
                  const isFix = b.toLowerCase().startsWith('fix') || b.toLowerCase().startsWith('keep')
                  const isIssue = b.toLowerCase().startsWith('issue')
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

  // Fix Now state
  const [fixedContent, setFixedContent] = useState('')
  const [fixingIssue, setFixingIssue] = useState('')
  const [fixLoading, setFixLoading] = useState(false)
  const [fixError, setFixError] = useState('')
  const [copied, setCopied] = useState(false)
  // Publish state
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [published, setPublished] = useState(false)
  // Article lookup (for URL-based audits)
  const [articleLookup, setArticleLookup] = useState<{ id: number; title: string; slug: string; category_slug: string } | null>(null)
  const [lookupError, setLookupError] = useState('')
  // Track what was audited so Fix Now works even when URL was used
  const auditSourceRef = useRef<{ content: string; url: string }>({ content: '', url: '' })
  const fixPanelRef = useRef<HTMLDivElement>(null)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })
    const saved = localStorage.getItem('seo_optimize_content')
    if (saved) { setContent(saved); localStorage.removeItem('seo_optimize_content') }
  }, [router])

  function handleAuditUrlChange(url: string) {
    setAuditUrl(url)
    setArticleLookup(null)
    setLookupError('')
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    if (!url.trim()) return
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/seo/article-lookup?url=${encodeURIComponent(url.trim())}`)
        const data = await res.json()
        if (!res.ok) { setLookupError(data.error ?? 'Not found'); return }
        setArticleLookup({ id: data.id, title: data.title, slug: data.slug, category_slug: data.category_slug })
      } catch {
        setLookupError('Lookup failed')
      }
    }, 600)
  }

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
    setFixedContent('')
    setFixingIssue('')
    setPublished(false)
    setPublishError('')
    auditSourceRef.current = { content: content.trim(), url: auditUrl.trim() }

    try {
      const res = await fetch('/api/admin/seo/analyze-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), url: auditUrl.trim() }),
      })
      if (!res.ok) {
        const text = await res.text()
        let errMsg = 'Audit failed'
        try { errMsg = JSON.parse(text).error ?? errMsg } catch { errMsg = text.slice(0, 300) || errMsg }
        throw new Error(errMsg)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setAuditMarkdown(accumulated)
      }
      setLoadingState('done')
    } catch (err: any) {
      setError(err.message)
      setLoadingState('error')
    }
  }

  async function handleFix(fix: string) {
    setFixLoading(true)
    setFixError('')
    setFixedContent('')
    setFixingIssue(fix)
    setCopied(false)
    setPublished(false)
    setPublishError('')

    // Scroll to fix panel after a tick
    setTimeout(() => fixPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)

    try {
      const res = await fetch('/api/admin/seo/fix-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: auditSourceRef.current.content,
          url: auditSourceRef.current.url,
          articleId: articleLookup?.id ?? null,
          fix,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        let errMsg = 'Fix failed'
        try { errMsg = JSON.parse(text).error ?? errMsg } catch { errMsg = text.slice(0, 300) || errMsg }
        throw new Error(errMsg)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setFixedContent(accumulated)
      }
    } catch (err: any) {
      setFixError(err.message)
    } finally {
      setFixLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(fixedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleUseAndReaudit() {
    setContent(fixedContent)
    setFixedContent('')
    setFixingIssue('')
    setAuditMarkdown('')
    setLoadingState('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handlePublish() {
    if (!articleLookup || !fixedContent) return
    setPublishLoading(true)
    setPublishError('')
    try {
      const res = await fetch(`/api/admin/articles/${articleLookup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fixedContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPublished(true)
    } catch (err: any) {
      setPublishError(err.message)
    } finally {
      setPublishLoading(false)
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
                    onChange={e => handleAuditUrlChange(e.target.value)}
                    placeholder="https://trading365.org/reviews/mexc-review"
                    className={inputClass}
                  />
                  {articleLookup && (
                    <p className="mt-1.5 text-xs text-green-400">
                      ✓ Article found: <span className="font-medium">{articleLookup.title}</span> — fixes will update the live article
                    </p>
                  )}
                  {lookupError && (
                    <p className="mt-1.5 text-xs text-amber-400">Article not found in DB — fixes won&apos;t auto-publish</p>
                  )}
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

            {/* Audit Results */}
            {auditMarkdown && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
                {loadingState === 'loading' && (
                  <p className="text-xs text-zinc-500 mb-4 animate-pulse">Analysing article…</p>
                )}
                {loadingState === 'done' && (
                  <p className="text-xs text-zinc-600 mb-4">Click <span className="text-green-400 font-medium">Fix Now</span> on any issue to apply it automatically.</p>
                )}
                <AuditMarkdown
                  text={auditMarkdown}
                  onFix={handleFix}
                  isDone={loadingState === 'done'}
                />
              </div>
            )}

            {/* Fix Now output panel */}
            {(fixLoading || fixedContent || fixError) && (
              <div ref={fixPanelRef} className="bg-zinc-900 border border-green-900/50 rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-green-400">Fixed Article</h3>
                    {fixingIssue && (
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        <span className="text-zinc-400">Fix applied:</span> {fixingIssue}
                      </p>
                    )}
                  </div>
                  {!fixLoading && fixedContent && (
                    <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                      <button
                        onClick={handleCopy}
                        className={`px-3 py-1.5 border rounded text-xs font-medium transition-colors ${
                          copied
                            ? 'bg-green-900/50 border-green-600 text-green-300'
                            : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        onClick={handleUseAndReaudit}
                        className="px-3 py-1.5 bg-zinc-700 text-zinc-200 hover:bg-zinc-600 rounded text-xs font-medium"
                      >
                        Re-audit
                      </button>
                      {articleLookup && (
                        <button
                          onClick={handlePublish}
                          disabled={publishLoading || published}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            published
                              ? 'bg-green-700 text-white'
                              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400'
                          }`}
                        >
                          {published ? '✓ Published' : publishLoading ? 'Publishing…' : 'Publish to Site'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {fixError && (
                  <p className="text-xs text-red-400 mb-3">{fixError}</p>
                )}
                {publishError && (
                  <p className="text-xs text-red-400 mb-3">Publish failed: {publishError}</p>
                )}

                {fixLoading && !fixedContent && (
                  <div className="text-center py-8 text-zinc-600 text-sm">Applying fix…</div>
                )}

                {fixedContent && (
                  <textarea
                    value={fixedContent}
                    onChange={e => setFixedContent(e.target.value)}
                    rows={24}
                    readOnly={fixLoading}
                    className="w-full px-3 py-3 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg font-mono text-xs leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                )}
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
