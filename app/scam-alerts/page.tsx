export const revalidate = 300

import type { Metadata } from "next"
import { getCategoryMetadata, default as CategoryPageContent } from "@/lib/page-templates/category"

export async function generateMetadata(): Promise<Metadata> {
  return getCategoryMetadata("scam-alerts")
}

export default function ScamAlertsPage() {
  return <CategoryPageContent category="scam-alerts" />
}
