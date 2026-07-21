'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type AnalyticsData = {
  totals: { today: string; week: string; month: string; total: string }
  visitors: { today: string; week: string; month: string }
  bots: { bots: string; humans: string; classified: string }
  sessions: { today: string; week: string; month: string }
  engagement: { avg_duration_ms: string | null; avg_scroll_pct: string | null; measured: string }
  sessionStats: { sessions: string; bounced: string; pages_per_session: string | null; avg_session_ms: string | null }
  entryPages: { path: string; sessions: string }[]
  exitPages: { path: string; sessions: string }[]
  topPages: { path: string; views: string }[]
  topReferrers: { source: string; views: string }[]
  referringLinks: { url: string; views: string; visitors: string }[]
  searchTerms: { term: string; views: string; visitors: string }[]
  utmSources: { utm_source: string; utm_medium: string; views: string }[]
  countries: { country: string; views: string }[]
  devices: { device: string; views: string }[]
  daily: { day: string; views: string }[]
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
      <div style={{ flex: 1, background: '#1e293b', borderRadius: 4, height: 8 }}>
        <div style={{ width: `${pct}%`, background: '#3b82f6', borderRadius: 4, height: 8 }} />
      </div>
      <span style={{ fontSize: '0.8rem', color: '#94a3b8', minWidth: 40, textAlign: 'right' }}>{value.toLocaleString()}</span>
    </div>
  )
}

// Human-readable duration from milliseconds: "0s" / "45s" / "2m 30s".
function fmtDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const card: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: '1.25rem 1.5rem',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [settingUp, setSettingUp] = useState(false)

  useEffect(() => {
    fetch('/api/admin/check-session').then(r => {
      if (!r.ok) router.push('/admin')
    })
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/analytics')
      if (res.status === 401) { router.push('/admin'); return }
      const json = await res.json()
      if (json.error?.includes('relation') || json.error?.includes('does not exist')) {
        setSetupNeeded(true)
      } else if (json.error) {
        setError(json.error)
      } else {
        setData(json)
      }
    } catch {
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetup() {
    setSettingUp(true)
    try {
      const res = await fetch('/api/admin/setup-analytics', { method: 'POST' })
      if (res.ok) { setSetupNeeded(false); loadData() }
    } finally {
      setSettingUp(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Analytics</h1>
            <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>Top row = page views (incl. bots) · green = unique humans · breakdowns below exclude bots</p>
          </div>
          <Link href="/admin" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.875rem' }}>← Back to Admin</Link>
        </div>

        {loading && <p style={{ color: '#64748b' }}>Loading...</p>}

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        {setupNeeded && (
          <div style={{ ...card, borderColor: '#f59e0b', marginBottom: '2rem' }}>
            <p style={{ color: '#fbbf24', margin: '0 0 1rem', fontWeight: 600 }}>Database table not set up yet.</p>
            <button
              onClick={handleSetup}
              disabled={settingUp}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600 }}
            >
              {settingUp ? 'Creating...' : 'Create Analytics Table'}
            </button>
            <p style={{ color: '#64748b', margin: '0.75rem 0 0', fontSize: '0.8rem' }}>One-time setup — creates the page_views table in your Neon database.</p>
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              {([
                { label: 'Today', value: Number(data.totals.today) },
                { label: 'Last 7 Days', value: Number(data.totals.week) },
                { label: 'Last 30 Days', value: Number(data.totals.month) },
                { label: 'All Time', value: Number(data.totals.total) },
              ] as const).map(({ label, value }) => (
                <div key={label} style={card}>
                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#f1f5f9' }}>{value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Unique Visitors + Bot share (populated from the upgrade onward) */}
            {data.visitors && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {([
                  { label: 'Unique — Today', value: Number(data.visitors.today) },
                  { label: 'Unique — 7 Days', value: Number(data.visitors.week) },
                  { label: 'Unique — 30 Days', value: Number(data.visitors.month) },
                ] as const).map(({ label, value }) => (
                  <div key={label} style={card}>
                    <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                    <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#34d399' }}>{value.toLocaleString()}</p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: '#475569' }}>humans, deduped</p>
                  </div>
                ))}
                {(() => {
                  const b = Number(data.bots?.bots ?? 0)
                  const h = Number(data.bots?.humans ?? 0)
                  const tot = b + h
                  const pct = tot > 0 ? Math.round((b / tot) * 100) : 0
                  const color = pct >= 50 ? '#f87171' : pct >= 25 ? '#fbbf24' : '#34d399'
                  return (
                    <div style={card}>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bot share — 30 Days</p>
                      <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color }}>{pct}%</p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: '#475569' }}>{b.toLocaleString()} bot / {tot.toLocaleString()} classified</p>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Engagement / behavior */}
            {data.sessionStats && (
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Engagement <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 400 }}>· last 30 days · humans only</span></h2>
                {(() => {
                  const sess = Number(data.sessionStats.sessions || 0)
                  const bounced = Number(data.sessionStats.bounced || 0)
                  const bounceRate = sess > 0 ? Math.round((bounced / sess) * 100) : 0
                  const bounceColor = bounceRate >= 70 ? '#f87171' : bounceRate >= 50 ? '#fbbf24' : '#34d399'
                  const tiles: { label: string; value: string; sub?: string; color?: string }[] = [
                    { label: 'Sessions — 30d', value: sess.toLocaleString(), sub: `${Number(data.sessions?.today ?? 0).toLocaleString()} today · ${Number(data.sessions?.week ?? 0).toLocaleString()} this week` },
                    { label: 'Pages / Session', value: data.sessionStats.pages_per_session ? Number(data.sessionStats.pages_per_session).toFixed(2) : '—' },
                    { label: 'Bounce Rate', value: `${bounceRate}%`, sub: `${bounced.toLocaleString()} single-page`, color: bounceColor },
                    { label: 'Avg Time on Page', value: fmtDuration(Number(data.engagement?.avg_duration_ms ?? 0)), sub: `${Number(data.engagement?.measured ?? 0).toLocaleString()} measured` },
                    { label: 'Avg Session', value: fmtDuration(Number(data.sessionStats.avg_session_ms ?? 0)) },
                    { label: 'Avg Scroll Depth', value: data.engagement?.avg_scroll_pct ? `${Number(data.engagement.avg_scroll_pct)}%` : '—' },
                  ]
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
                      {tiles.map(t => (
                        <div key={t.label} style={card}>
                          <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.label}</p>
                          <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: t.color ?? '#f1f5f9' }}>{t.value}</p>
                          {t.sub && <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: '#475569' }}>{t.sub}</p>}
                        </div>
                      ))}
                    </div>
                  )
                })()}
                <p style={{ margin: '0.6rem 0 0', fontSize: '0.68rem', color: '#475569' }}>Time-on-page for the last page of a session is approximate — browsers don't always report a hard tab-close.</p>
              </div>
            )}

            {/* Entry & Exit pages */}
            {(data.entryPages?.length > 0 || data.exitPages?.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {([
                  { title: 'Entry Pages', hint: 'Where visitors land', rows: data.entryPages },
                  { title: 'Exit Pages', hint: 'Where visitors leave', rows: data.exitPages },
                ] as const).map(({ title, hint, rows }) => (
                  <div key={title} style={card}>
                    <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>{title}</h2>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#475569' }}>{hint} · by sessions</p>
                    {rows.length === 0
                      ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No data yet.</p>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {rows.map(row => (
                            <div key={row.path} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ flex: '0 0 auto', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }} title={row.path}>{row.path}</span>
                              <Bar value={Number(row.sessions)} max={Number(rows[0]?.sessions ?? 1)} />
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}

            {/* Daily Chart */}
            {data.daily.length > 0 && (
              <div style={{ ...card, marginBottom: '2rem' }}>
                <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Daily Visits — Last 30 Days</h2>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                  {(() => {
                    const maxViews = Math.max(...data.daily.map(d => Number(d.views)))
                    return data.daily.map(d => (
                      <div
                        key={d.day}
                        title={`${d.day}: ${Number(d.views).toLocaleString()} views`}
                        style={{
                          flex: 1,
                          background: '#3b82f6',
                          borderRadius: '2px 2px 0 0',
                          height: `${Math.max(4, Math.round((Number(d.views) / maxViews) * 80))}px`,
                          opacity: 0.85,
                        }}
                      />
                    ))
                  })()}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Top Pages */}
              <div style={card}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Top Pages</h2>
                {data.topPages.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No data yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {data.topPages.map(row => (
                        <div key={row.path} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ flex: '0 0 auto', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }} title={row.path}>{row.path}</span>
                          <Bar value={Number(row.views)} max={Number(data.topPages[0]?.views ?? 1)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Traffic Sources */}
              <div style={card}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Traffic Sources</h2>
                {data.topReferrers.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No data yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {data.topReferrers.map(row => (
                        <div key={row.source} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ flex: '0 0 auto', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#94a3b8' }}>{row.source}</span>
                          <Bar value={Number(row.views)} max={Number(data.topReferrers[0]?.views ?? 1)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Referring Links (full URLs) + Search Terms */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Referring Links — the actual external page that linked here */}
              <div style={card}>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Referring Links</h2>
                <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#475569' }}>Exact external pages linking to you · last 30 days · humans only</p>
                {data.referringLinks.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No external referrers yet.</p>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.72rem' }}>Referring URL</th>
                          <th style={{ textAlign: 'right', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.72rem', width: 70 }}>Views</th>
                          <th style={{ textAlign: 'right', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.72rem', width: 80 }}>Visitors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.referringLinks.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #1e293b' }}>
                            <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>
                              <a href={row.url} target="_blank" rel="noreferrer noopener" style={{ color: '#93c5fd', textDecoration: 'none', fontFamily: 'monospace' }}>{row.url}</a>
                            </td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right', color: '#f1f5f9', fontWeight: 600 }}>{Number(row.views).toLocaleString()}</td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right', color: '#94a3b8' }}>{Number(row.visitors).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>

              {/* Search Terms — parsed from search-engine referrer query strings */}
              <div style={card}>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Search Terms</h2>
                <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#475569' }}>Bing/Yahoo/Yandex etc. · Google hides its own keywords (use Search Console)</p>
                {data.searchTerms.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No search-term referrers captured.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {data.searchTerms.map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ flex: '0 0 auto', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#e2e8f0' }} title={row.term}>{row.term}</span>
                          <Bar value={Number(row.views)} max={Number(data.searchTerms[0]?.views ?? 1)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
              {/* UTM Campaigns */}
              <div style={card}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>UTM Campaigns</h2>
                {data.utmSources.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No UTM traffic yet.</p>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.75rem' }}>Source</th>
                          <th style={{ textAlign: 'left', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.75rem' }}>Medium</th>
                          <th style={{ textAlign: 'right', color: '#64748b', fontWeight: 500, paddingBottom: '0.5rem', fontSize: '0.75rem' }}>Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.utmSources.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #1e293b' }}>
                            <td style={{ padding: '0.4rem 0', color: '#e2e8f0' }}>{row.utm_source}</td>
                            <td style={{ padding: '0.4rem 0', color: '#94a3b8' }}>{row.utm_medium}</td>
                            <td style={{ padding: '0.4rem 0', textAlign: 'right', color: '#f1f5f9', fontWeight: 600 }}>{Number(row.views).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>

              {/* Countries */}
              <div style={card}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Countries</h2>
                {data.countries.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No data yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {data.countries.map(row => (
                        <div key={row.country} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ flex: '0 0 auto', width: 80, fontSize: '0.8rem', color: '#94a3b8' }}>{row.country}</span>
                          <Bar value={Number(row.views)} max={Number(data.countries[0]?.views ?? 1)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Devices */}
              <div style={card}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Devices</h2>
                {data.devices.length === 0
                  ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No data yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {data.devices.map(row => (
                        <div key={row.device} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ flex: '0 0 auto', width: 80, fontSize: '0.8rem', color: '#94a3b8', textTransform: 'capitalize' }}>{row.device}</span>
                          <Bar value={Number(row.views)} max={Number(data.devices[0]?.views ?? 1)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
