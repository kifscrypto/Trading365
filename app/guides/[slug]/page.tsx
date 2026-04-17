export const revalidate = 3600

import type { Metadata } from "next"
import { getArticleMetadata, default as ArticlePageContent } from "@/lib/page-templates/article"

interface Params { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return getArticleMetadata("guides", slug)
}

export default async function GuideArticlePage({ params }: Params) {
  const { slug } = await params
  return <ArticlePageContent category="guides" slug={slug} />
}
