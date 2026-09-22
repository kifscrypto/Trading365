'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Who signed up, and did they buy.
//
// Until this page existed there was no way to see either. The only admin
// affordance over accounts was /api/admin/entitlements — one email at a time,
// and it had no UI calling it — so both questions needed hand-written SQL. The
// first time it was pointed at real data it showed a signup from the previous
// day that nobody knew had happened, and that not one purchase had ever
// completed.
//
// Grant and revoke reuse /api/admin/entitlements rather than reimplementing it,
// so the manual path and the payment webhook keep going through the same
// grantEntitlement/revokeEntitlement.

type Member = {
  id: number
  email: string
  referral_code: string
  referred_by: string | null
  created_at: string
  last_login_at: string | null
  tier: 'free' | 'paid'
  paid_until: string | null
  grant_source: string | null
  grant_external_id: string | null
  paid_orders: number
  last_plan: string | null
}

type Order = {
  order_id: string
  plan: string
  status: string
  /** NUMERIC arrives as a string; never sum these without parsing. */
  amount_usd: string | null
  user_id: number | null
  email: string | null
  paid_at: string | null
  expires_at: string | null
  created_at: string
}

type Summary = {
  total: number
  paid: number
  free: number
  signups7d: number
  signups30d: number
  expiring30d: number
  paidOrders: number
  pendingOrders: number
  pendingAttributed: number
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' }).format(d)
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d) + ' UTC'
}

/** Whole days from now until an ISO date; negative once expired. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

const card: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: '1.25rem 1.5rem',
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem',
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8',
  borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '0.55rem 0.75rem', fontSize: '0.82rem',
  borderBottom: '1px solid #16202f', whiteSpace: 'nowrap',
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>
        {label}
      </div>
      <div style={{ marginTop: '0.4rem', fontSize: '1.75rem', fontWeight: 700, color: tone ?? '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {hint && <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: '#64748b' }}>{hint}</div>}
    </div>
  )
}

export default function MembersPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [includePending, setIncludePending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch('/api/admin/check-session').then((r) => { if (!r.ok) router.push('/admin') })
  }, [router])

  const load = useCallback(async (opts?: { search?: string; includePending?: boolean }) => {
    const q = opts?.search ?? search
    const p = opts?.includePending ?? includePending
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/members?search=${encodeURIComponent(q)}&includePending=${p}`)
      if (res.status === 401) { router.push('/admin'); return }
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Request failed'); return }
      setSummary(json.summary)
      setMembers(json.members ?? [])
      setOrders(json.orders ?? [])
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [search, includePending, router])

  useEffect(() => { load() }, [load])

  /**
   * Grant or revoke through the EXISTING entitlements endpoint. On success we
   * reload rather than patching local state, because the server derives `tier`
   * from entitlements — guessing at it here is how the two screens would start
   * disagreeing.
   */
  async function mutate(body: Record<string, unknown>, key: string, okMsg: string) {
    setBusy(key)
    setNote('')
    try {
      const res = await fetch('/api/admin/entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setNote(json?.error ?? 'Action failed'); return }
      // The grant route reports whether the member was actually emailed. An admin
      // comping a customer needs to know if the customer was told — otherwise this
      // screen would be back to reporting a silent grant as a success.
      const emailed = typeof json?.email === 'string' ? json.email : null
      setNote(emailed && emailed !== 'not-sent' ? `${okMsg} — notification: ${emailed}` : okMsg)
      await load()
    } catch {
      setNote('Network error')
    } finally {
      setBusy(null)
    }
  }

  const conversion = summary && summary.total > 0
    ? `${((summary.paid / summary.total) * 100).toFixed(1)}%`
    : '—'

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Members</h1>
        <p style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#94a3b8' }}>
          Who has signed up, and who has actually paid.
        </p>

        {error && (
          <div role="alert" style={{ marginTop: '1rem', ...card, borderColor: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
        )}
        {note && (
          <div role="status" style={{ marginTop: '1rem', ...card, borderColor: '#1e3a8a', color: '#93c5fd' }}>{note}</div>
        )}

        {summary && (
          <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '1.25rem' }}>
            <Stat label="Signups" value={summary.total} hint={`${summary.free} free · ${summary.paid} paid`} />
            <Stat label="Paying" value={summary.paid} tone={summary.paid > 0 ? '#4ade80' : undefined} />
            <Stat label="Conversion" value={conversion} />
            <Stat label="New (7d)" value={summary.signups7d} hint={`${summary.signups30d} in 30d`} />
            <Stat label="Expiring ≤30d" value={summary.expiring30d} tone={summary.expiring30d > 0 ? '#fbbf24' : undefined} />
            <Stat
              label="Orders converted"
              value={summary.paidOrders}
              hint={summary.paidOrders === 0 ? 'no purchase has ever completed' : undefined}
              tone={summary.paidOrders > 0 ? '#4ade80' : undefined}
            />
            <Stat
              label="Checkouts abandoned"
              value={summary.pendingAttributed}
              hint={
                summary.pendingAttributed > 0
                  ? `by a signed-in account — real intent`
                  : `${summary.pendingOrders - summary.pendingAttributed} anonymous, not demand`
              }
              tone={summary.pendingAttributed > 0 ? '#fbbf24' : undefined}
            />
          </div>
        )}

        {/* ── Members ─────────────────────────────────────────────────────── */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load({ search: e.currentTarget.value }) }}
            placeholder="Search by email…"
            aria-label="Search members by email"
            style={{
              flex: '1 1 260px', minWidth: 220, background: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 6, padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem',
            }}
          />
          <button
            onClick={() => load({ search })}
            disabled={loading}
            style={{ background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {loading ? 'Loading…' : 'Search'}
          </button>
          <button
            onClick={() => { setSearch(''); load({ search: '' }) }}
            style={{ background: '#1e293b', color: '#cbd5e1', border: 0, borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Clear
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => { setIncludePending(e.target.checked); load({ includePending: e.target.checked }) }}
            />
            Show abandoned orders
          </label>
        </div>

        <h2 style={{ marginTop: '1.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#cbd5e1' }}>
          Accounts ({members.length}{members.length === 200 ? '+' : ''})
        </h2>
        <div style={{ marginTop: '0.6rem', overflowX: 'auto', ...card, padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Joined</th>
                <th style={th}>Last login</th>
                <th style={th}>Tier</th>
                <th style={th}>Paid until</th>
                <th style={th}>Source</th>
                <th style={th}>Orders</th>
                <th style={th}>Plan</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr><td style={td} colSpan={9}>{loading ? 'Loading…' : 'No accounts match.'}</td></tr>
              )}
              {members.map((m) => {
                const left = daysUntil(m.paid_until)
                return (
                  <tr key={m.id}>
                    <td style={td}>{m.email}</td>
                    <td style={{ ...td, color: '#94a3b8' }}>{fmtDate(m.created_at)}</td>
                    <td style={{ ...td, color: '#94a3b8' }}>{fmtDate(m.last_login_at)}</td>
                    <td style={td}>
                      <span style={{
                        padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                        background: m.tier === 'paid' ? 'rgba(74,222,128,0.15)' : '#1e293b',
                        color: m.tier === 'paid' ? '#4ade80' : '#94a3b8',
                      }}>
                        {m.tier}
                      </span>
                    </td>
                    <td style={td}>
                      {m.paid_until
                        ? <>{fmtDate(m.paid_until)} <span style={{ color: left !== null && left <= 30 ? '#fbbf24' : '#64748b' }}>({left}d)</span></>
                        : m.tier === 'paid' ? <span style={{ color: '#94a3b8' }}>lifetime</span> : '—'}
                    </td>
                    <td style={{ ...td, color: '#94a3b8' }}>{m.grant_source ?? '—'}</td>
                    <td style={td}>{m.paid_orders}</td>
                    <td style={{ ...td, color: '#94a3b8' }}>{m.last_plan ?? '—'}</td>
                    <td style={td}>
                      {m.tier === 'paid' && m.grant_source && m.grant_external_id ? (
                        <button
                          disabled={busy !== null}
                          onClick={() => mutate(
                            { revoke: true, source: m.grant_source, externalId: m.grant_external_id },
                            `revoke-${m.id}`,
                            `Revoked ${m.grant_source}/${m.grant_external_id} from ${m.email}`,
                          )}
                          title={`Revoke ${m.grant_source} / ${m.grant_external_id}`}
                          style={{ background: '#7f1d1d', color: '#fecaca', border: 0, borderRadius: 5, padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          {busy === `revoke-${m.id}` ? 'Revoking…' : 'Revoke'}
                        </button>
                      ) : m.tier === 'paid' ? (
                        // A lifetime grant legitimately has no external id, and a
                        // paid row whose entitlement carries none cannot be revoked
                        // by this endpoint. Say so rather than offering a button
                        // that would send an empty externalId and fail.
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>lifetime grant</span>
                      ) : (
                        <button
                          disabled={busy !== null}
                          onClick={() => mutate({ email: m.email, days: 30, source: 'manual' }, `grant-${m.id}`, `Granted 30 days to ${m.email}`)}
                            title="Grants 30 days and emails them to say so"
                          style={{ background: '#14532d', color: '#bbf7d0', border: 0, borderRadius: 5, padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          {busy === `grant-${m.id}` ? 'Granting…' : 'Grant 30d'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Orders ──────────────────────────────────────────────────────── */}
        <h2 style={{ marginTop: '1.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#cbd5e1' }}>
          Orders ({orders.length})
        </h2>
        {!includePending && summary && summary.pendingOrders > 0 && (
          <p style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
            {summary.pendingOrders} unfinished orders are hidden — they are not all the same thing.{' '}
            {summary.pendingAttributed > 0 ? (
              <>
                <strong style={{ color: '#fbbf24' }}>{summary.pendingAttributed} came from a signed-in account</strong>, which is a
                real abandoned checkout: someone reached a hosted checkout and stopped. The other{' '}
                {summary.pendingOrders - summary.pendingAttributed} have no account and date from before the old{' '}
                <code style={{ color: '#94a3b8' }}>GET /api/pay/create</code> was fixed, when a crawler following a link created an
                order (and a NOWPayments invoice) as a side effect.
              </>
            ) : (
              <>
                All {summary.pendingOrders} have no account attached and date from before the old{' '}
                <code style={{ color: '#94a3b8' }}>GET /api/pay/create</code> was fixed, when a crawler following a link created an
                order (and a NOWPayments invoice) as a side effect.
              </>
            )}{' '}
            Tick “Show abandoned orders” to inspect them.
          </p>
        )}
        <div style={{ marginTop: '0.6rem', overflowX: 'auto', ...card, padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Plan</th>
                <th style={th}>Status</th>
                <th style={th}>Amount</th>
                <th style={th}>Account</th>
                <th style={th}>Paid</th>
                <th style={th}>Access until</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td style={td} colSpan={8}>{loading ? 'Loading…' : 'No orders yet.'}</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', color: '#94a3b8' }} title={o.order_id}>
                    {o.order_id.length > 28 ? `${o.order_id.slice(0, 28)}…` : o.order_id}
                  </td>
                  <td style={td}>{o.plan}</td>
                  <td style={td}>
                    <span style={{
                      padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                      background: o.status === 'paid' || o.status === 'active' ? 'rgba(74,222,128,0.15)' : '#1e293b',
                      color: o.status === 'paid' || o.status === 'active' ? '#4ade80' : '#94a3b8',
                    }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                    {o.amount_usd !== null ? `$${o.amount_usd}` : '—'}
                  </td>
                  <td style={{ ...td, color: o.email ? '#e2e8f0' : '#64748b' }}>
                    {o.email ?? <span title="Legacy Telegram-only order, made before accounts existed">(no account)</span>}
                  </td>
                  <td style={{ ...td, color: '#94a3b8' }}>{fmtDateTime(o.paid_at)}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{o.expires_at ? fmtDate(o.expires_at) : '—'}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{fmtDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}