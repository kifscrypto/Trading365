export const dynamic = 'force-dynamic'

import type { Metadata } from "next"
import { getArticleMetadata, default as ArticlePageContent } from "@/lib/page-templates/article"

interface Params { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return getArticleMetadata("reviews", slug)
}

export default async function ReviewArticlePage({ params }: Params) {
  const { slug } = await params
  return <ArticlePageContent category="reviews" slug={slug} />
}
