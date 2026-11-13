import type { MetadataRoute } from "next";
import { LEGAL, LEGAL_PAGE_LIST } from "@/lib/legal";
import { isIndexableDeployment, SITE_URL } from "@/lib/metadata";
import { fetchArticles } from "@/lib/researchArticles";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexableDeployment) return [];

  // An unreachable API leaves the article entries out rather than failing the sitemap.
  const articles = await fetchArticles().catch(() => []);

  // Workspace and research library URLs are not indexing targets.
  return [
    { url: `${SITE_URL}/` },
    { url: `${SITE_URL}/pricing` },
    { url: `${SITE_URL}/research`, priority: 0.6 },
    ...articles.map((article) => ({
      url: `${SITE_URL}/research/${article.slug}`,
      ...(article.publishedAt ? { lastModified: article.publishedAt } : {}),
      priority: 0.5,
    })),
    ...LEGAL_PAGE_LIST.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified: LEGAL.lastUpdatedISO,
      priority: 0.3,
    })),
  ];
}
