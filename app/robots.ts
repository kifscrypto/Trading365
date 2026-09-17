import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Allow the OG image endpoint so social crawlers can fetch card images;
        // the more specific /api/og allow wins over the /api/ disallow.
        allow: ["/", "/api/og"],
        // Block API and admin routes — never block /_next/ as it
        // prevents Googlebot from fetching JS/CSS needed to render pages
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: [
      "https://trading365.org/sitemap.xml",
      // Signal receipts are a separate sitemap so the article sitemap stays
      // untouched and archive history can be switched on independently via
      // SIGNALS_BACKFILL_INDEXABLE — this endpoint only ever lists indexable URLs.
      "https://trading365.org/signals-sitemap.xml",
    ],
  }
}
