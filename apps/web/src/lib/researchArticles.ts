import {
  ArticleDetailSchema,
  ArticleListItemSchema,
  type ArticleDetail,
  type ArticleListItem,
} from "@repo/schemas";
import { SITE_NAME, SITE_URL } from "./metadata";
import { paperLink } from "./researchCategories";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

async function getData(path: string): Promise<unknown | null> {
  const res = await fetch(`${API_SERVICE_URL}/api${path}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Research API ${path} answered ${res.status}`);
  return ((await res.json()) as { data: unknown }).data;
}

export async function fetchArticles(): Promise<ArticleListItem[]> {
  return ArticleListItemSchema.array().parse((await getData("/research/articles")) ?? []);
}

export async function fetchArticle(slug: string): Promise<ArticleDetail | null> {
  const data = await getData(`/research/articles/${encodeURIComponent(slug)}`);
  return data ? ArticleDetailSchema.parse(data) : null;
}

// Older links point at /research/<finding id>; the public lookup returns only the slug and title.
export async function fetchFindingSlug(id: string): Promise<string | null> {
  const data = (await getData(`/findings/${encodeURIComponent(id)}`)) as { slug?: unknown } | null;
  return typeof data?.slug === "string" ? data.slug : null;
}

export function articleDescription(summary: string): string {
  const text = summary.replace(/\s+/g, " ").trim();
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

export function articleStructuredData(article: ArticleDetail) {
  const url = `${SITE_URL}/research/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: article.title,
    description: articleDescription(article.summary),
    inLanguage: "en",
    keywords: article.tags.join(", ") || undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    citation: article.references.map((ref) => ({
      "@type": "CreativeWork",
      name: ref.title ?? ref.url ?? undefined,
      url: paperLink(ref) ?? undefined,
      author: ref.authors ?? undefined,
      datePublished: ref.year ? String(ref.year) : undefined,
      isPartOf: ref.venue ?? undefined,
    })),
  };
}
