import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Linkedin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"

import { AUTHORS, getAuthorBySlug } from "@/lib/data/authors"
import { siteConfig } from "@/lib/data/site-config"

const BASE_URL = "https://trading365.org"
const OG_IMAGE = `${BASE_URL}/trading365-crypto-exchange-reviews.jpg`

export function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author) return { title: "Author Not Found", robots: { index: false, follow: false } }
  const title = `${author.name} — ${author.role} | Trading365`
  const description = author.bio.slice(0, 155)
  const url = `${BASE_URL}/authors/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: author.name }],
      siteName: "Trading365",
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  }
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author) notFound()

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: `${BASE_URL}/authors/${author.slug}`,
    jobTitle: author.role,
    description: author.bio,
    knowsAbout: author.expertise,
    worksFor: { "@type": "Organization", name: siteConfig.name, url: BASE_URL },
    ...(author.linkedIn ? { sameAs: [author.linkedIn] } : {}),
  }

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
          <Breadcrumbs items={[{ label: "Authors" }, { label: author.name }]} />

          <div className="mt-6 flex items-start gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl font-bold text-primary">
              {author.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{author.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{author.role}</p>
              {author.linkedIn && (
                <a
                  href={author.linkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-6 space-y-8">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">About</h2>
          <p className="text-sm leading-relaxed text-foreground">{author.bio}</p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Areas of Expertise</h2>
          <div className="flex flex-wrap gap-2">
            {author.expertise.map(e => (
              <Badge key={e} variant="secondary">{e}</Badge>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Follow Trading365</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            {siteConfig.socials.twitter && (
              <a href={siteConfig.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">X (Twitter)</a>
            )}
            {siteConfig.socials.discord && (
              <a href={siteConfig.socials.discord} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Discord</a>
            )}
            {siteConfig.socials.facebook && (
              <a href={siteConfig.socials.facebook} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Facebook</a>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Link
            href="/about#editorial"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Editorial Policy
          </Link>
        </div>
      </div>
    </div>
  )
}
