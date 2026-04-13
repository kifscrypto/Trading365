'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'input' | 'outline' | 'article' | 'links' | 'audit' | 'image' | 'seo' | 'publish'
const ALL_STEPS: Step[] = ['input', 'outline', 'article', 'links', 'audit', 'image', 'seo', 'publish']
const STEP_LABELS: Record<Step, string> = {
  input: 'Input', outline: 'Outline', article: 'Article',
  links: 'Links', audit: 'Audit', image: 'Image', seo: 'SEO & Details', publish: 'Publish',
}

const CATEGORIES = [
  { label: 'Exchange Reviews', slug: 'reviews' },
  { label: 'Comparisons', slug: 'comparisons' },
  { label: 'Bonuses', slug: 'bonuses' },
  { label: 'No-KYC', slug: 'no-kyc' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function extractTitle(text: string) {
  const line = text.split('\n').map(l => l.trim()).find(l => /^#{1,3}\s/.test(l))
  return line ? line.replace(/^#+\s*/, '').trim() : ''
}

function extractExcerpt(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const body = lines.filter(l => !/^#{1,3}\s/.test(l))
  const p = body.find(l => l.length > 40 && !l.startsWith('-') && !l.startsWith('*')) ?? ''
  return p.slice(0, 200)
}

// ─── AuditMarkdown ────────────────────────────────────────────────────────────

function AuditMarkdown({
  text, onFix, isDone, fixLoading,
}: {
  text: string
  onFix: (fix: string) => void
  isDone: boolean
  fixLoading: boolean
}) {
  const scoreMatch = text.match(/(\d+)\s*\/\s*100/)
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null

  function parseSection(heading: string): string[] {
    const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`### ${esc}\\n([\\s\\S]*?)(?=\\n### |\\n---|$)`)
    const m = text.match(re)
    if (!m) return []
    return m[1].trim().split('\n').filter(l => l.trim()).map(l => l.replace(/^[-\d.]\s*/, '').trim()).filter(Boolean)
  }

  const priorities = parseSection('🎯 Top 3 Priority Actions')
  const weaknesses = parseSection('⚔️ Key Weaknesses')
  const compression = parseSection('✂️ Compression Opportunities')
  const linking = parseSection('🔗 Internal Linking Gaps')
  const totalIssues = priorities.length + weaknesses.length + compression.length + linking.length

  function handleFixAll() {
    const parts: string[] = []
    if (priorities.length) parts.push('TOP PRIORITY ACTIONS:\n' + priorities.map((p, i) => `${i + 1}. ${p}`).join('\n'))
    if (weaknesses.length) parts.push('KEY WEAKNESSES:\n' + weaknesses.map(w => `- ${w}`).join('\n'))
    if (compression.length) parts.push('COMPRESSION:\n' + compression.map(c => `- ${c}`).join('\n'))
    if (linking.length) parts.push('LINKING:\n' + linking.map(l => `- ${l}`).join('\n'))
    onFix('Apply ALL of the following improvements simultaneously:\n\n' + parts.join('\n\n'))
  }

  const fixBtn = (label: string) => isDone && !fixLoading ? (
    <button
      onClick={() => onFix(label)}
      className="shrink-0 px-2.5 py-1 bg-green-900/40 border border-green-700/60 text-green-400 hover:bg-green-900/70 hover:border-green-600 rounded text-xs font-medium whitespace-nowrap transition-colors"
    >
      Fix Now
    </button>
  ) : null

  return (
    <div className="space-y-5">
      {score !== null && (
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-700">
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-bold ${score >= 75 ? 'text-green-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {score}
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-100">/ 100</p>
              <p className="text-xs text-zinc-500 mt-0.5">Ranking + conversion score</p>
            </div>
          </div>
          {isDone && totalIssues > 0 && (
            <button
              onClick={handleFixAll}
              disabled={fixLoading}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 rounded-lg text-sm font-medium whitespace-nowrap"
            >
              Fix All Issues ({totalIssues})
            </button>
          )}
        </div>
      )}

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

// ─── LinkingMarkdown ──────────────────────────────────────────────────────────

function LinkingMarkdown({
  text,
  selected,
  onToggle,
}: {
  text: string
  selected: Set<number>
  onToggle: (i: number) => void
}) {
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
            const isSelected = selected.has(i)
            return (
              <div
                key={i}
                className={`border rounded-lg overflow-hidden transition-opacity ${isSelected ? 'border-zinc-700' : 'border-zinc-800 opacity-40'}`}
              >
                <div
                  className="bg-zinc-800 px-4 py-2.5 flex items-center gap-2.5 cursor-pointer select-none"
                  onClick={() => onToggle(i)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(i)}
                    onClick={e => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-700 accent-blue-500 cursor-pointer shrink-0"
                  />
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArticleStudioPage() {
  const router = useRouter()

  // Step unlock — tracks how far the user has progressed
  const [unlockedIdx, setUnlockedIdx] = useState(0)

  // Step 1: Input
  const [keyword, setKeyword] = useState('')
  const [intent, setIntent] = useState('review')
  const [weaknesses, setWeaknesses] = useState('')
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [affiliateLinks, setAffiliateLinks] = useState<{ slug: string; name: string; affiliate_url: string; general_url: string | null }[]>([])
  const [affiliateLink, setAffiliateLink] = useState('')
  const [affiliateDetected, setAffiliateDetected] = useState('')  // exchange name shown in UI

  // Step 2: Outline
  const [outline, setOutline] = useState('')

  // Step 3: Article — single source of truth, mutated by audit fixes and refinements
  const [article, setArticle] = useState('')
  const [articleLoading, setArticleLoading] = useState(false)
  const [fixStats, setFixStats] = useState<{ applied: number; failed: number } | null>(null)
  const [refineInstructions, setRefineInstructions] = useState('')
  const [refineLoading, setRefineLoading] = useState(false)
  const [refineCount, setRefineCount] = useState(0)

  // Step 4: Links
  const [linkingMarkdown, setLinkingMarkdown] = useState('')
  const [linksLoading, setLinksLoading] = useState(false)
  const [applyLinksLoading, setApplyLinksLoading] = useState(false)
  const [applyLinksResult, setApplyLinksResult] = useState<{ applied: number; total: number } | null>(null)
  const [selectedLinkIndices, setSelectedLinkIndices] = useState<Set<number>>(new Set())

  // Step 5: Audit
  const [auditMarkdown, setAuditMarkdown] = useState('')
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditDone, setAuditDone] = useState(false)
  const [fixLoading, setFixLoading] = useState(false)
  const [fixError, setFixError] = useState('')

  // Step 6: Image
  const [imagePrompt, setImagePrompt] = useState('')
  const [imagePromptLoading, setImagePromptLoading] = useState(false)
  const [imageCopied, setImageCopied] = useState(false)
  const [imageUrl, setImageUrl] = useState('')

  // Step 7: SEO Tags + Details
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [metaKeywords, setMetaKeywords] = useState('')
  const [pros, setPros] = useState('')        // one per line
  const [cons, setCons] = useState('')        // one per line
  const [quickFactsMd, setQuickFactsMd] = useState('')
  const [quickFactsInserted, setQuickFactsInserted] = useState(false)
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([])
  const [metaLoading, setMetaLoading] = useState(false)

  // Step 8: Publish
  const [pubTitle, setPubTitle] = useState('')
  const [pubSlug, setPubSlug] = useState('')
  const [pubCategory, setPubCategory] = useState('reviews')
  const [pubCategoryLabel, setPubCategoryLabel] = useState('Exchange Reviews')
  const [pubExcerpt, setPubExcerpt] = useState('')
  const [pubPublished, setPubPublished] = useState(false)
  const [pubLoading, setPubLoading] = useState(false)
  const [pubError, setPubError] = useState('')
  const [pubDone, setPubDone] = useState<{ id: number; slug: string; category_slug: string } | null>(null)

  const [error, setError] = useState('')

  // ── Step helpers ────────────────────────────────────────────────────────────

  function unlock(step: Step) {
    const idx = ALL_STEPS.indexOf(step)
    setUnlockedIdx(prev => Math.max(prev, idx))
  }

  function isUnlocked(step: Step) {
    return ALL_STEPS.indexOf(step) <= unlockedIdx
  }

  function currentStepLabel() {
    return STEP_LABELS[ALL_STEPS[unlockedIdx]]
  }

  // ── Initialise ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => { if (!r.ok) router.push('/admin') })

    // Load affiliate links
    fetch('/api/admin/affiliate-links').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAffiliateLinks(data)
    }).catch(() => {})

    const saved = localStorage.getItem('seo_keyword_analysis')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.keyword) setKeyword(data.keyword)
        if (data.analysis) {
          const intentMatch = data.analysis.match(/## Search Intent\n([^\n]+)/)
          if (intentMatch) {
            const raw = intentMatch[1].toLowerCase()
            if (raw.includes('comparison')) setIntent('comparison')
            else if (raw.includes('informational')) setIntent('informational')
            else if (raw.includes('hybrid')) setIntent('hybrid')
            else setIntent('review')
          }
          const weakMatch = data.analysis.match(/## SERP Weaknesses\n([\s\S]*?)(?=\n## |$)/)
          if (weakMatch) {
            const lines = weakMatch[1].trim().split('\n')
              .filter((l: string) => l.trim().startsWith('-'))
              .map((l: string) => l.replace(/^-\s*/, '').trim())
            if (lines.length) setWeaknesses(lines.join('\n'))
          }
        }
      } catch {}
    }
  }, [router])

  // ── Affiliate link detection ────────────────────────────────────────────────

  function detectAffiliate(kw: string) {
    if (!affiliateLinks.length) return
    const lower = kw.toLowerCase()
    const match = affiliateLinks.find(l =>
      lower.includes(l.slug.toLowerCase()) ||
      lower.includes(l.name.toLowerCase())
    )
    if (match) {
      setAffiliateLink(match.affiliate_url)
      setAffiliateDetected(match.name)
    } else {
      // Don't clear if user manually typed a link
    }
  }

  function handleKeywordChange(val: string) {
    setKeyword(val)
    detectAffiliate(val)
  }

  // ── Step 1 → 2: Generate outline ───────────────────────────────────────────

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
      unlock('outline')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setOutlineLoading(false)
    }
  }

  // ── Step 2 → 3: Generate article ───────────────────────────────────────────

  async function generateArticle() {
    setError('')
    setArticleLoading(true)
    setArticle('')
    setFixStats(null)
    unlock('article')
    try {
      const res = await fetch('/api/admin/seo/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, outline, intent, affiliateLink: affiliateLink.trim() || null }),
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
    } catch (err: any) {
      setError(err.message)
    } finally {
      setArticleLoading(false)
    }
  }

  // ── Step 3: Refine article ──────────────────────────────────────────────────

  async function refineArticle() {
    if (!refineInstructions.trim()) return
    setError('')
    setRefineLoading(true)
    setArticle('')
    setFixStats(null)
    try {
      const res = await fetch('/api/admin/seo/refine-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, instructions: refineInstructions, keyword, affiliateLink: affiliateLink.trim() || null }),
      })
      if (!res.ok || !res.body) throw new Error('Refinement failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setArticle(text)
      }
      setRefineCount(c => c + 1)
      setRefineInstructions('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRefineLoading(false)
    }
  }

  // ── Step 3 → 4: Links ──────────────────────────────────────────────────────

  async function generateLinks() {
    setError('')
    setLinksLoading(true)
    setLinkingMarkdown('')
    unlock('links')
    try {
      const res = await fetch('/api/admin/seo/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, mode: 'links' }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300) || 'Server error') }
      if (!res.ok) throw new Error(data.error ?? 'Links analysis failed')
      const md = data.linkingMarkdown ?? ''
      setLinkingMarkdown(md)
      // Select all link blocks by default
      const oppMatch = md.match(/## Internal Link Opportunities\n([\s\S]*?)(?=\n## |$)/)
      const blocks = oppMatch ? oppMatch[1].trim().split(/(?=\n\d+\.\s+\*\*)/).filter(Boolean) : []
      setSelectedLinkIndices(new Set(blocks.map((_, i) => i)))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinksLoading(false)
    }
  }

  async function applyLinks() {
    if (!linkingMarkdown || !article) return
    setApplyLinksLoading(true)
    setApplyLinksResult(null)
    try {
      // Filter to selected blocks only
      const oppMatch = linkingMarkdown.match(/## Internal Link Opportunities\n([\s\S]*?)(?=\n## |$)/)
      const allBlocks = oppMatch ? oppMatch[1].trim().split(/(?=\n\d+\.\s+\*\*)/).filter(Boolean) : []
      const selectedBlocks = allBlocks.filter((_, i) => selectedLinkIndices.has(i))
      if (!selectedBlocks.length) {
        setApplyLinksResult({ applied: 0, total: 0 })
        return
      }
      const fix = `Apply all of the following internal link suggestions to the article. For each suggestion, find the anchor text in the article and wrap it with the recommended link URL. Only apply a link where the exact anchor text exists in the article — do not force or invent text.\n\nReferral/affiliate links must NOT be bold — use plain [text](url) only.\n\n## Internal Link Opportunities\n${selectedBlocks.join('\n')}`
      const res = await fetch('/api/admin/seo/fix-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, fix }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Apply links failed')
      setArticle(data.content ?? article)
      setApplyLinksResult({ applied: data.applied, total: data.total })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setApplyLinksLoading(false)
    }
  }

  // ── Step 4/5: Audit ─────────────────────────────────────────────────────────

  async function runAudit() {
    setError('')
    setAuditLoading(true)
    setAuditDone(false)
    setAuditMarkdown('')
    setFixStats(null)
    setFixError('')
    unlock('audit')
    try {
      const res = await fetch('/api/admin/seo/analyze-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article }),
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
      setAuditDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAuditLoading(false)
    }
  }

  async function handleFix(fix: string) {
    setFixLoading(true)
    setFixError('')
    setFixStats(null)
    try {
      const res = await fetch('/api/admin/seo/fix-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, fix }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fix failed')
      setArticle(data.content ?? article)
      setFixStats({ applied: data.applied, failed: data.failed })
    } catch (err: any) {
      setFixError(err.message)
    } finally {
      setFixLoading(false)
    }
  }

  // ── Step 5 → 6: Image prompt ───────────────────────────────────────────────

  async function generateImagePrompt() {
    setError('')
    setImagePromptLoading(true)
    setImagePrompt('')
    unlock('image')
    try {
      const res = await fetch('/api/admin/seo/image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, keyword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Image prompt generation failed')
      setImagePrompt(data.prompt)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImagePromptLoading(false)
    }
  }

  function copyImagePrompt() {
    navigator.clipboard.writeText(imagePrompt)
    setImageCopied(true)
    setTimeout(() => setImageCopied(false), 2000)
  }

  // ── Step 6 → 7: SEO tags ───────────────────────────────────────────────────

  async function generateMetaTags() {
    setError('')
    setMetaLoading(true)
    setQuickFactsInserted(false)
    unlock('seo')
    try {
      const res = await fetch('/api/admin/seo/meta-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: article, keyword, title: pubTitle || extractTitle(article) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Meta tag generation failed')
      setMetaTitle(data.meta_title ?? '')
      setMetaDescription(data.meta_description ?? '')
      setMetaKeywords(data.meta_keywords ?? '')
      setPros((data.pros ?? []).join('\n'))
      setCons((data.cons ?? []).join('\n'))
      setQuickFactsMd(data.quick_facts_md ?? '')
      setFaqs(data.faqs ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMetaLoading(false)
    }
  }

  function insertQuickFacts() {
    if (!quickFactsMd.trim()) return
    const block = `## Quick Facts\n\n${quickFactsMd.trim()}\n\n`
    // Insert after the first heading if one exists, otherwise prepend
    const headingMatch = article.match(/^(#{1,3} .+\n)/m)
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length
      setArticle(article.slice(0, insertAt) + '\n' + block + article.slice(insertAt))
    } else {
      setArticle(block + article)
    }
    setQuickFactsInserted(true)
  }

  // ── Step 7 → 8: Publish ────────────────────────────────────────────────────

  function openPublish() {
    const title = extractTitle(article)
    const excerpt = extractExcerpt(article)
    setPubTitle(title)
    setPubSlug(slugify(title))
    setPubExcerpt(excerpt)
    setPubError('')
    setPubDone(null)
    unlock('publish')
  }

  async function handlePublish() {
    if (!pubTitle.trim() || !pubSlug.trim()) { setPubError('Title and slug are required'); return }
    setPubLoading(true)
    setPubError('')
    const wordCount = article.trim().split(/\s+/).length
    const readTime = `${Math.max(1, Math.round(wordCount / 200))} min read`
    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pubTitle.trim(),
          slug: pubSlug.trim(),
          content: article,
          excerpt: pubExcerpt.trim(),
          category: pubCategoryLabel,
          category_slug: pubCategory,
          date: new Date().toISOString().split('T')[0],
          updated_date: null,
          read_time: readTime,
          author: 'Trading365 Team',
          rating: 0,
          thumbnail: imageUrl.trim() || '',
          tags: metaKeywords ? metaKeywords.split(',').map(k => k.trim()).filter(Boolean) : [],
          faqs: faqs.length ? faqs : null,
          pros: pros ? pros.split('\n').map(p => p.trim()).filter(Boolean) : null,
          cons: cons ? cons.split('\n').map(c => c.trim()).filter(Boolean) : null,
          meta_title: metaTitle.trim() || null,
          meta_description: metaDescription.trim() || null,
          meta_keywords: metaKeywords.trim() || null,
          published: pubPublished,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPubDone({ id: data.id, slug: data.slug, category_slug: data.category_slug })
    } catch (err: any) {
      setPubError(err.message)
    } finally {
      setPubLoading(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const ic = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'
  const panel = 'bg-zinc-900 border border-zinc-700 rounded-xl p-6'
  const h2 = 'text-sm font-semibold text-zinc-400 uppercase tracking-wider'
  const primaryBtn = 'px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 font-medium text-sm'
  const secondaryBtn = 'px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 text-sm disabled:text-zinc-500'
  const skipLink = 'text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 cursor-pointer'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Nav */}
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin/seo" className="text-zinc-400 hover:text-zinc-100 text-sm">← SEO Suite</Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">Article Studio</span>
        <div className="ml-auto flex items-center gap-1 text-xs overflow-x-auto">
          {ALL_STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-zinc-700">›</span>}
              <span className={
                i === unlockedIdx ? 'text-blue-400 font-medium' :
                i < unlockedIdx ? 'text-zinc-500' :
                'text-zinc-700'
              }>
                {STEP_LABELS[s]}
              </span>
            </span>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>
        )}

        {/* ── STEP 1: Input ── */}
        <div className={panel}>
          <h2 className={`${h2} mb-4`}>1. Input</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Keyword *</label>
              <input
                type="text"
                value={keyword}
                onChange={e => handleKeywordChange(e.target.value)}
                placeholder="e.g. bingx review"
                className={ic}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Intent</label>
              <select value={intent} onChange={e => setIntent(e.target.value)} className={ic}>
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
                rows={4}
                placeholder="No real user experience sections&#10;Weak or generic verdicts&#10;Outdated fee information"
                className={`${ic} font-mono`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-400">
                  Affiliate / CTA Link
                  {affiliateDetected && (
                    <span className="ml-2 text-green-400">✓ {affiliateDetected} detected</span>
                  )}
                </label>
                <Link href="/admin/affiliate-links" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-400">
                  Manage links →
                </Link>
              </div>
              <input
                type="url"
                value={affiliateLink}
                onChange={e => { setAffiliateLink(e.target.value); setAffiliateDetected('') }}
                placeholder="Auto-detected from keyword, or paste manually"
                className={ic}
              />
              <p className="mt-1 text-xs text-zinc-600">Used in all CTAs during generation. Leave blank to skip.</p>
            </div>

            <button onClick={generateOutline} disabled={outlineLoading || !keyword.trim()} className={primaryBtn}>
              {outlineLoading ? 'Generating outline…' : 'Generate Outline →'}
            </button>
          </div>
        </div>

        {/* ── STEP 2: Outline ── */}
        {isUnlocked('outline') && (
          <div className={panel}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={h2}>2. Outline</h2>
              <span className="text-xs text-zinc-500">Edit before generating</span>
            </div>
            <textarea
              value={outline}
              onChange={e => setOutline(e.target.value)}
              rows={16}
              className={`${ic} font-mono text-xs leading-relaxed`}
            />
            <div className="mt-4 flex gap-3">
              <button onClick={generateArticle} disabled={articleLoading || !outline.trim()} className={primaryBtn}>
                {articleLoading ? 'Writing article…' : 'Generate Article →'}
              </button>
              <button onClick={generateOutline} disabled={outlineLoading} className={secondaryBtn}>
                {outlineLoading ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Article ── */}
        {isUnlocked('article') && (
          <div className={panel}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={h2}>3. Article</h2>
              <div className="flex items-center gap-3">
                {fixStats && (
                  <span className="text-xs text-green-400">
                    {fixStats.applied} fix{fixStats.applied !== 1 ? 'es' : ''} applied
                    {fixStats.failed > 0 && <span className="text-amber-400 ml-1">· {fixStats.failed} failed</span>}
                  </span>
                )}
                {article && !articleLoading && (
                  <span className="text-xs text-zinc-600">{article.trim().split(/\s+/).length} words</span>
                )}
              </div>
            </div>

            {articleLoading && !article && (
              <div className="text-center py-10 text-zinc-500 text-sm animate-pulse">Writing article…</div>
            )}

            {article && (
              <textarea
                value={article}
                onChange={e => { setArticle(e.target.value); setFixStats(null) }}
                rows={40}
                className={`${ic} font-mono text-xs leading-relaxed`}
              />
            )}

            {/* Refine panel — always visible once article exists */}
            {article && !articleLoading && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Refine
                    {refineCount > 0 && (
                      <span className="ml-2 text-zinc-600 normal-case font-normal">({refineCount} pass{refineCount !== 1 ? 'es' : ''})</span>
                    )}
                  </label>
                </div>
                <textarea
                  value={refineInstructions}
                  onChange={e => setRefineInstructions(e.target.value)}
                  rows={3}
                  placeholder="e.g. Make the verdict more direct. Add more detail on futures fees. The Our Experience section feels generic — make it more specific."
                  className={`${ic} font-mono text-xs leading-relaxed`}
                />
                <div className="mt-2">
                  <button
                    onClick={refineArticle}
                    disabled={refineLoading || !refineInstructions.trim()}
                    className={primaryBtn}
                  >
                    {refineLoading ? 'Refining…' : 'Refine Article →'}
                  </button>
                </div>
              </div>
            )}

            {article && !articleLoading && !isUnlocked('links') && (
              <div className="mt-4 pt-4 border-t border-zinc-700 flex items-center gap-4">
                <button onClick={generateLinks} className={primaryBtn}>
                  Add Links →
                </button>
                <button onClick={() => { unlock('links'); unlock('audit'); runAudit() }} className={skipLink}>
                  Skip links, go to Audit →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Links ── */}
        {isUnlocked('links') && (
          <div className={panel}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={h2}>4. Links</h2>
              <div className="flex items-center gap-3">
                {linkingMarkdown && (
                  <>
                    {applyLinksResult && (
                      <span className="text-xs text-green-400">{applyLinksResult.applied}/{applyLinksResult.total} links applied</span>
                    )}
                    <button
                      onClick={applyLinks}
                      disabled={applyLinksLoading || linksLoading || selectedLinkIndices.size === 0}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      {applyLinksLoading ? 'Applying…' : `Apply Selected (${selectedLinkIndices.size})`}
                    </button>
                    <button onClick={generateLinks} disabled={linksLoading || applyLinksLoading} className="text-xs text-zinc-400 hover:text-zinc-200 disabled:text-zinc-600">
                      {linksLoading ? 'Regenerating…' : 'Regenerate'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {linksLoading && (
              <div className="text-center py-6 text-zinc-500 text-sm animate-pulse">Analysing links…</div>
            )}

            {linkingMarkdown && (
              <>
                <LinkingMarkdown
                  text={linkingMarkdown}
                  selected={selectedLinkIndices}
                  onToggle={i => setSelectedLinkIndices(prev => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })}
                />
                {!isUnlocked('audit') && (
                  <div className="mt-6 pt-4 border-t border-zinc-700">
                    <button onClick={runAudit} className={primaryBtn}>
                      Run Audit →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 5: Audit ── */}
        {isUnlocked('audit') && (
          <div className={panel}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={h2}>5. Audit</h2>
              <div className="flex items-center gap-2">
                {fixLoading && <span className="text-xs text-amber-400 animate-pulse">Applying fix…</span>}
                <button
                  onClick={runAudit}
                  disabled={auditLoading || fixLoading}
                  className={secondaryBtn}
                >
                  {auditLoading ? 'Auditing…' : auditMarkdown ? 'Re-audit' : 'Run Audit'}
                </button>
              </div>
            </div>

            {fixError && <p className="mb-3 text-xs text-red-400">{fixError}</p>}

            {auditLoading && !auditMarkdown && (
              <div className="text-center py-6 text-zinc-500 text-sm animate-pulse">Auditing article…</div>
            )}

            {auditMarkdown && (
              <>
                {auditLoading && <p className="text-xs text-zinc-500 mb-4 animate-pulse">Analysing…</p>}
                <AuditMarkdown
                  text={auditMarkdown}
                  onFix={handleFix}
                  isDone={auditDone}
                  fixLoading={fixLoading}
                />
                {auditDone && !isUnlocked('image') && (
                  <div className="mt-6 pt-4 border-t border-zinc-700 flex items-center gap-4">
                    <button onClick={generateImagePrompt} className={primaryBtn}>
                      Generate Image Prompt →
                    </button>
                    <button onClick={() => { unlock('image'); unlock('seo'); generateMetaTags() }} className={skipLink}>
                      Skip image, go to SEO Tags →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 6: Image ── */}
        {isUnlocked('image') && (
          <div className={panel}>
            <h2 className={`${h2} mb-4`}>6. Featured Image</h2>

            {imagePromptLoading && (
              <div className="text-center py-6 text-zinc-500 text-sm animate-pulse">Generating Higgsfield prompt…</div>
            )}

            {imagePrompt && (
              <div className="space-y-3 mb-6">
                <label className="block text-xs text-zinc-400">
                  Higgsfield Prompt <span className="text-zinc-600">— copy, generate in Higgsfield, paste URL below</span>
                </label>
                <textarea
                  value={imagePrompt}
                  onChange={e => setImagePrompt(e.target.value)}
                  rows={5}
                  className={`${ic} font-mono text-xs leading-relaxed`}
                />
                <div className="flex gap-2">
                  <button onClick={copyImagePrompt} className={secondaryBtn}>
                    {imageCopied ? '✓ Copied' : 'Copy Prompt'}
                  </button>
                  <button onClick={generateImagePrompt} disabled={imagePromptLoading} className={secondaryBtn}>
                    Regenerate
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">
                Image URL <span className="text-zinc-600">(paste after generating)</span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://…"
                className={ic}
              />
            </div>

            {!isUnlocked('seo') && (
              <div className="mt-6 pt-4 border-t border-zinc-700 flex items-center gap-4">
                <button onClick={generateMetaTags} className={primaryBtn}>
                  Generate SEO Tags →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 7: SEO Tags + Details ── */}
        {isUnlocked('seo') && (
          <div className={panel}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={h2}>7. SEO & Details</h2>
              <button onClick={generateMetaTags} disabled={metaLoading} className={secondaryBtn}>
                {metaLoading ? 'Generating…' : 'Regenerate All'}
              </button>
            </div>

            {metaLoading && (
              <div className="text-center py-6 text-zinc-500 text-sm animate-pulse">Generating SEO tags, pros/cons & quick facts…</div>
            )}

            {(metaTitle || metaDescription || metaKeywords || pros || cons || quickFactsMd) && (
              <div className="space-y-6">

                {/* SEO Tags */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">SEO Tags</p>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Meta Title <span className={metaTitle.length > 60 ? 'text-red-400' : 'text-zinc-600'}>({metaTitle.length}/60)</span>
                    </label>
                    <input type="text" value={metaTitle} onChange={e => setMetaTitle(e.target.value)} className={ic} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Meta Description <span className={metaDescription.length > 155 ? 'text-red-400' : 'text-zinc-600'}>({metaDescription.length}/155)</span>
                    </label>
                    <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={3} className={ic} />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Keywords <span className="text-zinc-600">(comma-separated)</span></label>
                    <input type="text" value={metaKeywords} onChange={e => setMetaKeywords(e.target.value)} className={ic} />
                  </div>
                </div>

                <div className="border-t border-zinc-700" />

                {/* Pros & Cons */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pros & Cons</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Pros <span className="text-zinc-600">(one per line)</span></label>
                      <textarea
                        value={pros}
                        onChange={e => setPros(e.target.value)}
                        rows={6}
                        placeholder="High leverage up to 200x&#10;No KYC required&#10;Competitive maker fees"
                        className={`${ic} font-mono text-xs leading-relaxed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Cons <span className="text-zinc-600">(one per line)</span></label>
                      <textarea
                        value={cons}
                        onChange={e => setCons(e.target.value)}
                        rows={6}
                        placeholder="Not available in the US&#10;Limited fiat options&#10;Support can be slow"
                        className={`${ic} font-mono text-xs leading-relaxed`}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-700" />

                {/* Quick Facts */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quick Facts</p>
                    <button
                      onClick={insertQuickFacts}
                      disabled={!quickFactsMd.trim() || quickFactsInserted}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        quickFactsInserted
                          ? 'bg-green-900/40 border border-green-700/60 text-green-400'
                          : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:text-zinc-500'
                      }`}
                    >
                      {quickFactsInserted ? '✓ Inserted into Article' : 'Insert into Article ↑'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-600">Edit the table below, then insert it into the article above.</p>
                  <textarea
                    value={quickFactsMd}
                    onChange={e => { setQuickFactsMd(e.target.value); setQuickFactsInserted(false) }}
                    rows={10}
                    className={`${ic} font-mono text-xs leading-relaxed`}
                  />
                </div>

                <div className="border-t border-zinc-700" />

                {/* FAQs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      FAQs <span className="normal-case font-normal text-zinc-600">({faqs.length})</span>
                    </p>
                    <button
                      onClick={() => setFaqs(f => [...f, { question: '', answer: '' }])}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      + Add FAQ
                    </button>
                  </div>
                  {faqs.length === 0 && (
                    <p className="text-xs text-zinc-600">No FAQs generated yet — click Regenerate All above.</p>
                  )}
                  <div className="space-y-3">
                    {faqs.map((faq, i) => (
                      <div key={i} className="border border-zinc-700 rounded-lg p-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-zinc-600 font-mono mt-2 shrink-0">Q{i + 1}</span>
                          <input
                            type="text"
                            value={faq.question}
                            onChange={e => setFaqs(f => f.map((item, j) => j === i ? { ...item, question: e.target.value } : item))}
                            placeholder="Question"
                            className={ic}
                          />
                          <button
                            onClick={() => setFaqs(f => f.filter((_, j) => j !== i))}
                            className="text-xs text-zinc-600 hover:text-red-400 mt-2 shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-zinc-600 font-mono mt-2 shrink-0">A</span>
                          <textarea
                            value={faq.answer}
                            onChange={e => setFaqs(f => f.map((item, j) => j === i ? { ...item, answer: e.target.value } : item))}
                            placeholder="Answer"
                            rows={3}
                            className={`${ic} text-xs leading-relaxed`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!isUnlocked('publish') && (
                  <div className="pt-2 border-t border-zinc-700">
                    <button onClick={openPublish} className={primaryBtn}>
                      Review & Publish →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 8: Publish ── */}
        {isUnlocked('publish') && !pubDone && (
          <div className={panel}>
            <h2 className={`${h2} mb-4`}>8. Review & Publish</h2>

            {/* Summary bar */}
            <div className="mb-6 p-3 bg-zinc-800/60 rounded-lg flex items-center gap-6 text-xs text-zinc-400 flex-wrap">
              <span>{article.trim().split(/\s+/).length} words</span>
              <span>{imageUrl ? <span className="text-green-400">Image attached</span> : <span className="text-zinc-600">No image</span>}</span>
              <span>{metaTitle ? <span className="text-green-400">Meta tags set</span> : <span className="text-zinc-600">No meta tags</span>}</span>
              <span>{pros ? <span className="text-green-400">{pros.split('\n').filter(Boolean).length} pros</span> : <span className="text-zinc-600">No pros</span>}</span>
              <span>{cons ? <span className="text-green-400">{cons.split('\n').filter(Boolean).length} cons</span> : <span className="text-zinc-600">No cons</span>}</span>
              <span>{quickFactsInserted ? <span className="text-green-400">Quick facts inserted</span> : <span className="text-zinc-600">No quick facts</span>}</span>
              <span>{faqs.length ? <span className="text-green-400">{faqs.length} FAQs</span> : <span className="text-zinc-600">No FAQs</span>}</span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Title *</label>
                  <input
                    type="text"
                    value={pubTitle}
                    onChange={e => { setPubTitle(e.target.value); setPubSlug(slugify(e.target.value)) }}
                    className={ic}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Slug *</label>
                  <input type="text" value={pubSlug} onChange={e => setPubSlug(e.target.value)} className={ic} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Category</label>
                  <select
                    value={pubCategory}
                    onChange={e => {
                      setPubCategory(e.target.value)
                      setPubCategoryLabel(CATEGORIES.find(c => c.slug === e.target.value)?.label ?? '')
                    }}
                    className={ic}
                  >
                    {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Excerpt</label>
                  <textarea value={pubExcerpt} onChange={e => setPubExcerpt(e.target.value)} rows={2} className={ic} />
                </div>
                {imageUrl && (
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-400 mb-1">Featured Image URL</label>
                    <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={ic} />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pubPublished}
                  onChange={e => setPubPublished(e.target.checked)}
                  className="rounded"
                />
                Publish immediately <span className="text-zinc-500">(unchecked = save as draft)</span>
              </label>

              {pubError && <p className="text-xs text-red-400">{pubError}</p>}

              <button onClick={handlePublish} disabled={pubLoading} className={primaryBtn}>
                {pubLoading ? 'Saving…' : pubPublished ? 'Publish Now' : 'Save as Draft'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {pubDone && (
          <div className="bg-zinc-900 border border-green-800/60 rounded-xl p-6">
            <p className="text-sm text-green-400 font-medium">
              ✓ Article {pubPublished ? 'published' : 'saved as draft'}
            </p>
            <div className="mt-3 flex gap-4">
              <a
                href={`https://trading365.org/${pubDone.category_slug}/${pubDone.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                View on site →
              </a>
              <a href={`/admin/articles/${pubDone.id}`} className="text-xs text-zinc-400 hover:text-zinc-300">
                Edit in admin →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
