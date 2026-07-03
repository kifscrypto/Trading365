import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { timingSafeEqual } from "node:crypto"
import { getArticleForPreviewBySlug } from "@/lib/db"
import ArticlePageContent from "@/lib/page-templates/article"

// Drafts change constantly and the URL carries a secret key — never cache, never index.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Draft Preview",
  robots: { index: false, follow: false, nocache: true },
}

/** Constant-time token comparison (avoids leaking length/prefix via timing). */
function tokenMatches(provided: string | undefined, expected: string | null): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ key?: string }>
}

export default async function ArticlePreviewPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { key } = await searchParams

  const row = await getArticleForPreviewBySlug(slug).catch(() => null)

  // Missing article, no token on it, or wrong key → indistinguishable 404
  // (never confirms a draft exists to anyone without the link).
  if (!row || !tokenMatches(key, row.preview_token)) notFound()

  return <ArticlePageContent category={row.category_slug} slug={slug} preview previewPublished={row.published} />
}
