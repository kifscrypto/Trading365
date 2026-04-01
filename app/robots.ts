import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Only block the API routes — never block /_next/ as it
        // prevents Googlebot from fetching JS/CSS needed to render pages
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://www.trading365.org/sitemap.xml",
  }
}
