import type { MetadataRoute } from "next";
import { LEGAL, LEGAL_PAGE_LIST } from "@/lib/legal";
import { isIndexableDeployment, SITE_URL } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableDeployment) return [];

  // Workspace and finding URLs are not indexing targets.
  return [
    { url: `${SITE_URL}/` },
    { url: `${SITE_URL}/pricing` },
    ...LEGAL_PAGE_LIST.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified: LEGAL.lastUpdatedISO,
      priority: 0.3,
    })),
  ];
}
