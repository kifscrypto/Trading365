import type { Metadata } from "next"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE_URL = "https://trading365.org"

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Trading365 Terms of Service. Read the terms and conditions governing your use of the Trading365 website.",
  alternates: {
    canonical: `${BASE_URL}/terms`,
  },
  openGraph: {
    type: "website",
    title: "Terms of Service | Trading365",
    description:
      "Read the terms and conditions governing your use of the Trading365 website.",
    url: `${BASE_URL}/terms`,
    siteName: "Trading365",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6">
      <Breadcrumbs items={[{ label: "Terms of Service" }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground text-balance">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>
            By accessing and using Trading365 (trading365.org), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use this website.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. Use of Content</h2>
          <p>
            All content on Trading365, including text, images, graphics, and data, is the property of Trading365 or its content suppliers and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works from any content without express written permission.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. No Financial Advice</h2>
          <p>
            Nothing on this website constitutes financial, investment, or trading advice. All content is for informational purposes only. You are solely responsible for any trading or investment decisions you make. Please read our{" "}
            <a href="/disclaimer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Disclaimer
            </a>{" "}
            for full details.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Affiliate Links</h2>
          <p>
            Trading365 uses affiliate links. By clicking affiliate links and registering or transacting on third-party exchanges, you acknowledge that Trading365 may receive a commission. These commercial relationships do not affect our editorial independence.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Trading365 shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the website or any content herein, including losses arising from cryptocurrency trading decisions made in reliance on our content.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Third-Party Websites</h2>
          <p>
            Our website contains links to third-party exchanges and services. These links are provided for convenience only. Trading365 has no control over the content or practices of third-party websites and accepts no responsibility for them.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of the website after any changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">8. Governing Law</h2>
          <p>
            These terms shall be governed by and construed in accordance with applicable laws. Any disputes shall be subject to the exclusive jurisdiction of the relevant courts.
          </p>
        </section>
      </div>
    </div>
  )
}
