import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Block API and admin routes — never block /_next/ as it
        // prevents Googlebot from fetching JS/CSS needed to render pages
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://trading365.org/sitemap.xml",
  }
}
