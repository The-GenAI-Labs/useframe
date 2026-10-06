import type { MetadataRoute } from "next";
import { isIndexableDeployment, SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    // Let crawlers read noindex on app pages; robots.txt is not access control.
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
