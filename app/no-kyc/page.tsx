import type { Metadata } from "next"
import { getCategoryMetadata, default as CategoryPageContent } from "@/lib/page-templates/category"

export async function generateMetadata(): Promise<Metadata> {
  return getCategoryMetadata("no-kyc")
}

export default function NoKycPage() {
  return <CategoryPageContent category="no-kyc" />
}
