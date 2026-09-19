import type { Metadata } from "next"
import AdminNav from "@/components/admin/admin-nav"

// The entire admin surface must never be indexed. Belt-and-braces with the
// /admin/ disallow in robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  // `./` is a RELATIVE canonical, which Next resolves against metadataBase to
  // the current URL — so every admin route becomes self-canonical from one
  // place. It used to inherit the layout's canonical and declare the homepage,
  // which is wrong even for a noindex page. Relative rather than absolute
  // because /admin has subpages and a fixed string would point them all at
  // /admin itself.
  alternates: { canonical: './' },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  )
}
