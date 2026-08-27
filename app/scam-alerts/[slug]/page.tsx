export const revalidate = 3600

import type { Metadata } from "next"
import { getArticleMetadata, default as ArticlePageContent } from "@/lib/page-templates/article"

interface Params { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return getArticleMetadata("scam-alerts", slug)
}

export default async function ScamAlertArticlePage({ params }: Params) {
  const { slug } = await params
  return <ArticlePageContent category="scam-alerts" slug={slug} />
}
