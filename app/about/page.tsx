import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ShieldCheck, BookOpen, Scale, Target, Mail, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE_URL = "https://www.trading365.org"
const OG_IMAGE = `${BASE_URL}/og-image.jpg`

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about Trading365's mission, methodology, and editorial standards. We provide unbiased crypto exchange reviews to help you trade smarter.",
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
  openGraph: {
    type: "website",
    title: "About Trading365 | Trade Smarter. Earn Bigger.",
    description:
      "Learn about Trading365's mission, methodology, and editorial standards. We provide unbiased crypto exchange reviews to help you trade smarter.",
    url: `${BASE_URL}/about`,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "About Trading365" }],
    siteName: "Trading365",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Trading365 | Trade Smarter. Earn Bigger.",
    description:
      "Learn about Trading365's mission, methodology, and editorial standards. We provide unbiased crypto exchange reviews to help you trade smarter.",
    images: [OG_IMAGE],
  },
}

const values = [
  {
    icon: ShieldCheck,
    title: "Independence",
    description:
      "We are not owned by or affiliated with any exchange. Our reviews are based on objective criteria and real-world testing.",
  },
  {
    icon: BookOpen,
    title: "Transparency",
    description:
      "We disclose all affiliate relationships and clearly mark sponsored content. Our revenue model never influences our ratings.",
  },
  {
    icon: Scale,
    title: "Accuracy",
    description:
      "Every claim is verified, every fee is confirmed, and every feature is tested firsthand before publication.",
  },
  {
    icon: Target,
    title: "User Focus",
    description:
      "We write for real traders. Our content is designed to be actionable, clear, and free of unnecessary jargon.",
  },
]

const methodology = [
  {
    step: "01",
    title: "Account Creation",
    description: "We create real accounts on each exchange and go through the actual registration process.",
  },
  {
    step: "02",
    title: "Deposit & Trade",
    description: "We deposit real funds, execute trades across spot and futures markets, and test withdrawal speeds.",
  },
  {
    step: "03",
    title: "Security Audit",
    description: "We evaluate security features, regulatory compliance, and review the exchange's track record.",
  },
  {
    step: "04",
    title: "Fee Analysis",
    description: "We calculate effective fees at multiple volume tiers and compare them against industry benchmarks.",
  },
  {
    step: "05",
    title: "UX Evaluation",
    description: "We test the platform on desktop and mobile, evaluating navigation, speed, and overall experience.",
  },
  {
    step: "06",
    title: "Final Rating",
    description: "All data points are aggregated into our 10-point rating scale, reviewed by the editorial team.",
  },
]

const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Trading365",
  url: "https://www.trading365.org/about",
  description:
    "Learn about Trading365's mission, methodology, and editorial standards. We provide unbiased crypto exchange reviews to help you trade smarter.",
  publisher: {
    "@type": "Organization",
    name: "Trading365",
    url: "https://www.trading365.org",
    logo: "https://www.trading365.org/images/logo-wide.png",
  },
}

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageSchema) }}
      />
      {/* Header */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-12 lg:px-6">
          <Breadcrumbs items={[{ label: "About" }]} />
          <div className="mt-6 flex flex-col items-center text-center">
            <Image
              src="/images/logo-icon.png"
              alt="Trading365"
              width={64}
              height={64}
              className="rounded-xl mb-6"
            />
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl text-balance">
              About Trading365
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              We are an independent team of crypto traders and researchers dedicated to helping you find the best exchange for your needs. Since 2024, we have reviewed over 50 platforms and helped 50,000+ traders make informed decisions.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-5xl px-4 py-16 lg:px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Our Values
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">What We Stand For</h2>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {values.map((v) => (
            <div
              key={v.title}
              className="flex gap-4 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <v.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{v.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {v.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator className="mx-auto max-w-5xl bg-border" />

      {/* Methodology */}
      <section id="methodology" className="mx-auto max-w-5xl px-4 py-16 lg:px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Methodology
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">How We Review Exchanges</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            Our review process is rigorous and standardized. Every exchange goes through the same six-step evaluation.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {methodology.map((m) => (
            <div
              key={m.step}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <span className="text-2xl font-bold text-primary/30 font-mono">{m.step}</span>
              <h3 className="font-semibold text-foreground">{m.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {m.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Separator className="mx-auto max-w-5xl bg-border" />

      {/* Editorial Policy */}
      <section id="editorial" className="mx-auto max-w-4xl px-4 py-16 lg:px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Editorial Policy
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Our Editorial Standards</h2>
        </div>
        <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Trading365 maintains strict editorial independence. Our writers and editors are never influenced by advertising revenue or affiliate partnerships when creating content or assigning ratings.
          </p>
          <p>
            All exchange reviews are based on firsthand testing and objective criteria. We use a standardized scoring system that evaluates fees, security, user experience, feature set, and customer support.
          </p>
          <p>
            When we link to an exchange, we may earn a commission at no extra cost to you. This affiliate revenue helps us maintain the site and continue providing free, unbiased reviews. However, affiliate relationships never influence our ratings, rankings, or editorial content.
          </p>
          <p>
            We update our reviews regularly to reflect changes in fees, features, and security. If an exchange's quality changes significantly, we will adjust our rating accordingly and note the change.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-4xl px-4 pb-16 lg:px-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center md:p-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Get in Touch</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Have questions, feedback, or business inquiries? We would love to hear from you.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button className="gap-2 font-semibold" asChild>
              <a href="mailto:contact@trading365.org">
                Email Us
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" className="font-semibold border-primary/30 text-foreground hover:bg-primary/10" asChild>
              <Link href="/bonuses">Advertise With Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
