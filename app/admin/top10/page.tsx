'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Top10Item = {
  rank: number
  name: string
  onScreenText: string
  voiceoverLine: string
}

type CoverConcept = {
  headline: string
  subline: string
  layout: string
  colors: string
}

type Package = {
  titleOptions?: string[]
  caption?: string
  hashtags?: string[]
  hooks?: string[]
  items?: Top10Item[]
  coverConcepts?: CoverConcept[]
  seoKeywords?: string[]
  postingTimes?: string[]
}

type HistoryRow = {
  id: number
  topic: string
  item_count: number
  tone: string | null
  created_at: string
}

const ic =
  'w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500 text-sm'

const TONES = ['Punchy', 'Nostalgic', 'Funny', 'Dramatic', 'Informative']

const CAPTION_LIMIT = 2200

export default function Top10StudioPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  // generate form
  const [topic, setTopic] = useState('')
  const [itemCount, setItemCount] = useState('10')
  const [tone, setTone] = useState('Punchy')
  const [generating, setGenerating] = useState(false)

  // current package
  const [pkgId, setPkgId] = useState<number | null>(null)
  const [pkgTopic, setPkgTopic] = useState('')
  const [pkg, setPkg] = useState<Package | null>(null)
  const [favoriteTitle, setFavoriteTitle] = useState<number | null>(null)

  // history
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/top10')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load history')
      setHistory(data.packages ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/admin/check-session').then((r) => {
      if (!r.ok) router.push('/admin')
    })
    loadHistory()
  }, [router, loadHistory])

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1500)
    } catch {
      setError('Copy failed — clipboard not available')
    }
  }

  const copyBtn = (key: string, label = 'Copy') => (
    <button
      onClick={copyBtnHandler(key)}
      className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 text-xs shrink-0"
    >
      {copied === key ? 'Copied ✓' : label}
    </button>
  )

  // copyBtn needs the text at click time; the handler map below keeps it simple
  const copyText: Record<string, () => string> = {}
  function copyBtnHandler(key: string) {
    return () => copy(copyText[key] ? copyText[key]() : '', key)
  }

  async function generate() {
    setError('')
    if (!topic.trim()) return setError('Enter a topic')
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/top10', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), itemCount: Number(itemCount) || 10, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setPkgId(data.id)
      setPkgTopic(topic.trim())
      setPkg(data.package)
      setFavoriteTitle(null)
      await loadHistory()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function openPackage(id: number) {
    setError('')
    try {
      const res = await fetch(`/api/admin/top10?id=${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load package')
      setPkgId(data.id)
      setPkgTopic(data.topic)
      setPkg(data.package)
      setFavoriteTitle(null)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function deletePackage(id: number) {
    if (!confirm('Delete this package?')) return
    setError('')
    try {
      const res = await fetch(`/api/admin/top10?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      if (pkgId === id) {
        setPkgId(null)
        setPkg(null)
        setPkgTopic('')
      }
      await loadHistory()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const hashtagString = (pkg?.hashtags ?? [])
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
  const copyAllBlock = `${pkg?.caption ?? ''}\n\n${hashtagString}`.trim()
  const captionLen = pkg?.caption?.length ?? 0

  copyText['caption'] = () => pkg?.caption ?? ''
  copyText['hashtags'] = () => hashtagString
  copyText['hooks'] = () => (pkg?.hooks ?? []).join('\n')
  copyText['titles'] = () => (pkg?.titleOptions ?? []).join('\n')
  copyText['keywords'] = () => (pkg?.seoKeywords ?? []).join(', ')
  copyText['times'] = () => (pkg?.postingTimes ?? []).join('\n')
  copyText['covers'] = () =>
    (pkg?.coverConcepts ?? [])
      .map((c, i) => `Cover ${i + 1}: ${c.headline} — ${c.subline} | layout: ${c.layout} | colors: ${c.colors}`)
      .join('\n')
  copyText['list'] = () =>
    (pkg?.items ?? [])
      .map((it) => `#${it.rank} ${it.name}\nOn-screen: ${it.onScreenText}\nVO: ${it.voiceoverLine}`)
      .join('\n\n')
  copyText['all'] = () => copyAllBlock

  const sectionHead = (title: string, key?: string) => (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
      {key && copyBtn(key)}
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 text-sm">
          ← Admin
        </Link>
        <span className="text-zinc-600">|</span>
        <span className="font-semibold text-zinc-100">Top 10 Studio</span>
        {pkg && (
          <button
            onClick={copyBtnHandler('all')}
            className="ml-auto px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium"
          >
            {copied === 'all' ? 'Copied ✓' : 'Copy All (caption + hashtags)'}
          </button>
        )}
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Generate */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Generate a TikTok package</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow min-w-[220px]">
              <label className="block text-xs text-zinc-400 mb-1">Topic *</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className={ic}
                placeholder="Top 10 Christmas adverts"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-zinc-400 mb-1">Items</label>
              <input
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                className={ic}
                inputMode="numeric"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs text-zinc-400 mb-1">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className={ic}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:bg-zinc-700 text-sm font-medium"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {generating && (
            <p className="text-xs text-cyan-400 mt-2">Generating… this can take a minute.</p>
          )}
        </div>

        {/* Package */}
        {pkg && (
          <div className="space-y-4 mb-6">
            <p className="text-xs text-zinc-500">
              Package #{pkgId} · {pkgTopic}
            </p>

            {/* Titles */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead('Title options', 'titles')}
              <div className="space-y-1.5">
                {(pkg.titleOptions ?? []).map((t, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
                    <input
                      type="radio"
                      name="favorite-title"
                      checked={favoriteTitle === i}
                      onChange={() => setFavoriteTitle(i)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead('Caption', 'caption')}
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{pkg.caption}</p>
              <p
                className={`text-xs mt-2 ${
                  captionLen > CAPTION_LIMIT ? 'text-red-400' : 'text-zinc-500'
                }`}
              >
                {captionLen} / {CAPTION_LIMIT} chars
              </p>
            </div>

            {/* Hashtags */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead('Hashtags', 'hashtags')}
              <p className="text-sm text-cyan-300 mb-2 break-words">{hashtagString}</p>
              <div className="flex flex-wrap gap-1.5">
                {(pkg.hashtags ?? []).map((h, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-400"
                  >
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Hooks */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead('Opening hooks', 'hooks')}
              <ul className="space-y-1.5">
                {(pkg.hooks ?? []).map((h, i) => (
                  <li key={i} className="text-sm text-zinc-200 flex gap-2">
                    <span className="text-zinc-600 shrink-0">{i + 1}.</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Countdown list */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead(`Countdown (${pkg.items?.length ?? 0} → 1)`, 'list')}
              <div className="space-y-2">
                {[...(pkg.items ?? [])]
                  .sort((a, b) => b.rank - a.rank)
                  .map((it, i) => (
                    <div key={i} className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-cyan-400 font-bold text-lg shrink-0">#{it.rank}</span>
                        <span className="font-medium text-zinc-100 text-sm">{it.name}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        <span className="text-zinc-600 uppercase tracking-wide">On-screen:</span>{' '}
                        {it.onScreenText}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        <span className="text-zinc-600 uppercase tracking-wide">VO:</span>{' '}
                        {it.voiceoverLine}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Cover concepts */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              {sectionHead('Cover concepts', 'covers')}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(pkg.coverConcepts ?? []).map((c, i) => (
                  <div key={i} className="border border-zinc-800 rounded-lg p-3">
                    <p className="font-semibold text-zinc-100 text-sm">{c.headline}</p>
                    <p className="text-xs text-zinc-400">{c.subline}</p>
                    <p className="text-xs text-zinc-500 mt-2">
                      <span className="text-zinc-600 uppercase tracking-wide">Layout:</span> {c.layout}
                    </p>
                    <p className="text-xs text-zinc-500">
                      <span className="text-zinc-600 uppercase tracking-wide">Colors:</span> {c.colors}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* SEO keywords + posting times */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                {sectionHead('SEO keywords', 'keywords')}
                <div className="flex flex-wrap gap-1.5">
                  {(pkg.seoKeywords ?? []).map((k, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                {sectionHead('Posting times', 'times')}
                <ul className="space-y-1.5">
                  {(pkg.postingTimes ?? []).map((t, i) => (
                    <li key={i} className="text-sm text-zinc-300">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="text-sm font-semibold text-zinc-300 hover:text-zinc-100"
            >
              {showHistory ? '▾' : '▸'} History ({history.length})
            </button>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 text-xs"
            >
              {historyLoading ? 'Reloading…' : 'Reload'}
            </button>
          </div>
          {showHistory && (
            <div className="mt-3 space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-600">No packages generated yet.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className={`flex items-center gap-3 text-sm border-b border-zinc-800/60 last:border-0 py-1.5 ${
                      pkgId === h.id ? 'text-cyan-300' : 'text-zinc-300'
                    }`}
                  >
                    <span className="text-xs text-zinc-500 w-32 shrink-0">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => openPackage(h.id)}
                      className="grow text-left hover:text-cyan-300 truncate"
                    >
                      {h.topic}
                    </button>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {h.item_count} items{h.tone ? ` · ${h.tone}` : ''}
                    </span>
                    <button
                      onClick={() => deletePackage(h.id)}
                      className="px-2 py-0.5 bg-red-900/40 text-red-400 border border-red-800/60 rounded hover:bg-red-900/70 text-xs shrink-0"
                    >
                      Del
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
