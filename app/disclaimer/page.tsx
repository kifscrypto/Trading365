import type { Metadata } from "next"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE_URL = "https://trading365.org"

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "Read the Trading365 disclaimer. This site contains affiliate links and provides general information only. Cryptocurrency trading carries significant risk.",
  alternates: {
    canonical: `${BASE_URL}/disclaimer`,
  },
  openGraph: {
    type: "website",
    title: "Disclaimer | Trading365",
    description:
      "Read the Trading365 disclaimer. This site contains affiliate links and provides general information only.",
    url: `${BASE_URL}/disclaimer`,
    siteName: "Trading365",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6">
      <Breadcrumbs items={[{ label: "Disclaimer" }]} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground text-balance">
        Disclaimer
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">General Information Only</h2>
          <p>
            The content published on Trading365 (trading365.org) is for general informational and educational purposes only. Nothing on this site constitutes financial advice, investment advice, trading advice, or any other type of professional advice. You should not treat any of the content on this website as such.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Cryptocurrency Risk Warning</h2>
          <p>
            Cryptocurrency trading involves a substantial risk of loss and is not suitable for every investor. The value of cryptocurrencies can go down as well as up, and you may lose all of your invested capital. Past performance is not indicative of future results. You should never invest money that you cannot afford to lose.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Affiliate Disclosure</h2>
          <p>
            Trading365 participates in affiliate programs. Some links on this website are affiliate links, meaning we may receive a commission at no additional cost to you if you click through and make a purchase or register on an exchange. Our editorial content is not influenced by these commercial relationships, and we always aim to provide honest, unbiased reviews.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Accuracy of Information</h2>
          <p>
            While we strive to keep all exchange data, fees, bonus information, and reviews accurate and up to date, exchange terms, fees, and offerings can change without notice. Always verify current terms directly with the exchange before making any trading or financial decisions.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">No Endorsement</h2>
          <p>
            Reference to any specific exchange, product, service, or entity does not constitute or imply endorsement, sponsorship, or recommendation by Trading365 unless explicitly stated.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Jurisdiction</h2>
          <p>
            Cryptocurrency regulations vary by country and jurisdiction. It is your responsibility to ensure that your use of any exchange or trading activity complies with all applicable laws and regulations in your jurisdiction.
          </p>
        </section>
      </div>
    </div>
  )
}
