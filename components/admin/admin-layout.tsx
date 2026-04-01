import Link from 'next/link'
import { ReactNode } from 'react'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/admin/dashboard" className="text-xl font-bold text-slate-900">
            Trading365 Admin
          </Link>
          <div className="flex gap-4">
            <Link href="/admin/dashboard" className="text-slate-600 hover:text-slate-900 font-medium">
              Dashboard
            </Link>
            <Link href="/admin/article/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
              New Article
            </Link>
            <form action="/api/admin/session" method="DELETE" style={{ display: 'contents' }}>
              <button className="text-red-600 hover:text-red-700 font-medium" onClick={(e) => {
                e.preventDefault()
                fetch('/api/admin/session', { method: 'DELETE' }).then(() => window.location.href = '/admin/login')
              }}>
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
