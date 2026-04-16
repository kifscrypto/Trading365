export const dynamic = 'force-dynamic'

import type { Metadata } from "next"
import { getCategoryMetadata, default as CategoryPageContent } from "@/lib/page-templates/category"

export async function generateMetadata(): Promise<Metadata> {
  return getCategoryMetadata("audits")
}

export default function AuditsPage() {
  return <CategoryPageContent category="audits" />
}
