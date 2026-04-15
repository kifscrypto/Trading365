import type { Metadata } from "next"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE_URL = "https://trading365.org"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Trading365 Privacy Policy. Learn how we collect, use, and protect your personal information when you visit our website.",
  alternates: {
    canonical: `${BASE_URL}/privacy`,
  },
  openGraph: {
    type: "website",
    title: "Privacy Policy | Trading365",
    description:
      "Learn how Trading365 collects, uses, and protects your personal information.",
    url: `${BASE_URL}/privacy`,
    siteName: "Trading365",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6">
      <Breadcrumbs items={[{ label: "Privacy Policy" }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground text-balance">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Information We Collect</h2>
          <p>
            When you visit Trading365, we may automatically collect certain technical information, including your IP address, browser type, operating system, referring URLs, and pages viewed. If you subscribe to our newsletter, we collect your email address.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to operate and improve the website, send newsletter communications (if you have opted in), analyse site traffic and usage patterns, and comply with legal obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. Cookies and Analytics</h2>
          <p>
            We use cookies and similar tracking technologies, including Google Analytics, to understand how visitors interact with our site. You can opt out of Google Analytics by installing the{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Google Analytics Opt-out Browser Add-on
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Third-Party Links and Affiliates</h2>
          <p>
            Our website contains affiliate links to third-party exchanges and services. When you click these links, you are subject to the privacy policies of those third parties. We are not responsible for their data practices.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. Data Retention</h2>
          <p>
            We retain newsletter subscriber data until you unsubscribe. Analytics data is retained in accordance with our analytics provider's standard retention periods.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the right to access, correct, or delete your personal data. To exercise these rights, please contact us via the contact information on our About page.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated date. Continued use of the website after any changes constitutes acceptance of the new policy.
          </p>
        </section>
      </div>
    </div>
  )
}
