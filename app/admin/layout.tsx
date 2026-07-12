import type { Metadata } from "next"
import AdminNav from "@/components/admin/admin-nav"

// The entire admin surface must never be indexed. Belt-and-braces with the
// /admin/ disallow in robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  )
}
