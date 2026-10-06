import type { MetadataRoute } from "next";
import { isIndexableDeployment, SITE_URL } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableDeployment) return [];

  // Legal pages are drafts; workspace and finding URLs are not indexing targets.
  return [{ url: `${SITE_URL}/` }];
}
