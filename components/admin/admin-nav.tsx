'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Shared floating admin menu. Rendered from app/admin/layout.tsx so it appears on
// EVERY admin sub-page (analytics, scanner, seo, …), which previously only had a
// lone "← Back to Admin" link. Hidden on the main /admin hub (it has its own
// app-shell nav whose two-pane editor layout must not be pushed down) and on the
// login screen.
const LINKS: { label: string; href: string; color: string }[] = [
  { label: 'Dashboard', href: '/admin', color: 'text-zinc-200 hover:text-white' },
  { label: 'Analytics', href: '/admin/analytics', color: 'text-blue-400 hover:text-blue-300' },
  { label: 'Scanner', href: '/admin/scanner', color: 'text-green-400 hover:text-green-300' },
  { label: 'Performance', href: '/admin/scanner/performance', color: 'text-green-400 hover:text-green-300' },
  { label: 'SEO Suite', href: '/admin/seo', color: 'text-purple-400 hover:text-purple-300' },
  { label: 'Affiliate Links', href: '/admin/affiliate-links', color: 'text-green-400 hover:text-green-300' },
  { label: 'Affiliate Earnings', href: '/admin/affiliate-earnings', color: 'text-amber-400 hover:text-amber-300' },
  { label: 'Categories', href: '/admin/categories', color: 'text-amber-400 hover:text-amber-300' },
  { label: 'Promotions', href: '/admin/promotions', color: 'text-pink-400 hover:text-pink-300' },
  { label: 'Featured', href: '/admin/featured', color: 'text-pink-400 hover:text-pink-300' },
  { label: 'Exchanges', href: '/admin/exchanges', color: 'text-emerald-400 hover:text-emerald-300' },
]

export default function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)

  // Only reveal the menu to a logged-in admin. Unauthenticated sub-page hits get
  // redirected to /admin by the page itself, so this just avoids a nav flash.
  useEffect(() => {
    let alive = true
    fetch('/api/admin/check-session')
      .then((r) => { if (alive) setAuthed(r.ok) })
      .catch(() => { if (alive) setAuthed(false) })
    return () => { alive = false }
  }, [pathname])

  // The main hub renders its own nav; login has none. Never show here.
  if (pathname === '/admin' || pathname === '/admin/login') return null
  if (!authed) return null

  async function handleLogout() {
    await fetch('/api/admin/session', { method: 'DELETE' })
    router.push('/admin/login')
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-1 overflow-x-auto border-b border-zinc-700 bg-zinc-900/90 px-4 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-zinc-900/75">
      <span className="mr-2 shrink-0 text-sm font-bold text-zinc-100">Trading365 Admin</span>
      {LINKS.map((link) => {
        const active = pathname === link.href
        return (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
              active ? 'bg-zinc-800 text-white' : link.color
            }`}
          >
            {link.label}
          </button>
        )
      })}
      <button
        onClick={handleLogout}
        className="ml-auto shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-red-400 transition-colors hover:text-red-300"
      >
        Logout
      </button>
    </nav>
  )
}
