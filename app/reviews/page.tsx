import type { Metadata } from "next"
import { getCategoryMetadata, default as CategoryPageContent } from "@/lib/page-templates/category"

export async function generateMetadata(): Promise<Metadata> {
  return getCategoryMetadata("reviews")
}

export default function ReviewsPage() {
  return <CategoryPageContent category="reviews" />
}
