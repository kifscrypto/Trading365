export const revalidate = 3600

import type { Metadata } from "next"
import { getArticleMetadata, default as ArticlePageContent } from "@/lib/page-templates/article"

// Bonuses articles render through the same shared template as every other
// category. The route was simply missing, which made the one published bonuses
// article unreachable three ways at once: the /bonuses hub linked it (ArticleCard
// builds /${categorySlug}/${slug}), app/sitemap.ts submitted it to Google, and
// two 301s in next.config.mjs pointed old WordPress URLs straight at it — so a
// crawl of this category produced a 404 from the sitemap, a 404 from an inbound
// redirect, and a 404 for a reader following the hub. Unpublished articles stay
// private: getArticleBySlug (lib/db) filters `published = true`, so the draft in
// this category still 404s here.
interface Params { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return getArticleMetadata("bonuses", slug)
}

export default async function BonusArticlePage({ params }: Params) {
  const { slug } = await params
  return <ArticlePageContent category="bonuses" slug={slug} />
}