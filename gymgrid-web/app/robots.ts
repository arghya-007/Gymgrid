import type { MetadataRoute } from "next";

// The current deployment is an authenticated pilot product, not the future
// public marketing site. Replace this with an allow-list and sitemap when the
// SEO website is launched.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
