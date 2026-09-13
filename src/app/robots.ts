import type { MetadataRoute } from "next";
import { absoluteSiteUrl, isSearchIndexingEnabled } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isSearchIndexingEnabled()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Quote pages carry a page-level noindex directive and must remain
      // crawlable for bots to read it. Private ERP and API routes are blocked.
      disallow: ["/admin", "/api", "/login"],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: absoluteSiteUrl("/"),
  };
}
