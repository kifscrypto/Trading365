'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const modules = [
  {
    href: '/admin/seo/keyword-analysis',
    label: 'Keyword + Intent Analysis',
    emoji: '🔍',
    desc: 'Enter a keyword. Get intent classification, what Google rewards, and a bullet list of weaknesses to exploit.',
    badge: 'Modules 1 + 2',
  },
  {
    href: '/admin/seo/content-generator',
    label: 'Article Studio',
    emoji: '✍️',
    desc: 'Full end-to-end workflow: outline → article → links → audit → image prompt → SEO tags → publish. One page, no copy-paste.',
    badge: 'Full Pipeline',
  },
  {
    href: '/admin/seo/content-optimizer',
    label: 'Content Optimizer',
    emoji: '✂️',
    desc: 'Paste any article. Get compression suggestions and exact internal linking placements.',
    badge: 'Modules 5 + 6',
  },
  {
    href: '/admin/seo/content-optimizer?mode=existing',
    label: 'Analyze Existing Article',
    emoji: '🔄',
    desc: 'Paste or fetch any published article. Get a full audit — score, weaknesses, compression, linking — with action buttons.',
    badge: 'Full Audit',
  },
  {
    href: '/admin/seo/our-experience',
    label: 'Our Experience Audit',
    emoji: '📝',
    desc: 'See which articles are missing the "Our Experience" section. Generate and publish it for any review with one click.',
    badge: 'Content Gap',
  },
]

export default function SeoSuitePage() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) router.push('/admin')
    })
  }, [router])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="bg-zinc-900 border-b border-zinc-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 text-sm">← Admin</Link>
        <span className="text-zinc-600">|</span>
        <span className="text-lg font-bold text-zinc-100">SEO Suite</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100">Trading365 SEO Suite</h1>
          <p className="mt-2 text-zinc-400">
            Crypto-specific content advantage system. Built to beat what's currently ranking — not copy it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-xl p-6 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-medium">
                  {m.badge}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-white mb-2">
                {m.label}
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">{m.desc}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-xl p-6">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Core principle</p>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Every output must answer: <span className="text-white font-medium">"How do we beat what's currently ranking — and convert the reader?"</span>
            {' '}No generic SEO output. No copying competitors. Identify weaknesses, build better structure, create tighter content.
          </p>
        </div>
      </div>
    </div>
  )
}
