import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Linkedin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE_URL = "https://trading365.org"

type AuthorProfile = {
  name: string
  slug: string
  role: string
  bio: string
  expertise: string[]
  linkedIn?: string
}

const AUTHORS: AuthorProfile[] = [
  {
    name: "Trading365 Team",
    slug: "trading365-team",
    role: "Editorial Team",
    bio: "The Trading365 editorial team consists of active crypto traders and financial writers with hands-on experience across the exchanges we review. Every review, comparison, and guide is written and verified by people who actually use these platforms — not outsourced content farms. We hold ourselves to a simple standard: if we wouldn't trade on it, we won't recommend it.",
    expertise: ["Crypto Exchange Reviews", "Derivatives & Leverage Trading", "No-KYC Platforms", "Fee Optimisation", "Crypto Bonuses & Promotions"],
    linkedIn: "",
  },
]

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const author = AUTHORS.find(a => a.slug === slug)
  if (!author) return { title: "Author Not Found" }
  return {
    title: `${author.name} — ${author.role} | Trading365`,
    description: author.bio.slice(0, 155),
    alternates: { canonical: `${BASE_URL}/authors/${slug}` },
  }
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const author = AUTHORS.find(a => a.slug === slug)
  if (!author) notFound()

  return (
    <div className="min-h-screen">
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
