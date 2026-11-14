import { prisma } from "@useframe/db"
import {
  ArticleDetailSchema,
  ArticleListItemSchema,
  type ArticleDetail,
  type ArticleListItem,
  type ResearchCategory,
  type ResearchReference,
} from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"

export const ARTICLE_LIST_CAP = 500

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

const httpUrl = (value: unknown): string | null => {
  const url = str(value)
  return url && /^https?:\/\//i.test(url) ? url : null
}

const yearOf = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{4}$/.test(value.trim()) ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 && n < 3000 ? n : null
}

// References are stored as the batch wrote them, so field names vary.
export function normalizeReference(value: unknown): ResearchReference | null {
  const r = record(value)
  const authors = Array.isArray(r.authors)
    ? r.authors.filter((a): a is string => typeof a === "string" && a.trim() !== "").join(", ") || null
    : str(r.authors)
  const reference = {
    title: str(r.title),
    url: httpUrl(r.url) ?? httpUrl(r.sourceUrl),
    authors,
    year: yearOf(r.year) ?? yearOf(r.publicationYear),
    venue: str(r.venue) ?? str(r.publishedIn) ?? str(r.journal),
    doi: str(r.doi),
  }
  return reference.title || reference.url ? reference : null
}

function sectionsOf(value: unknown): ArticleDetail["sections"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((s) => {
    const r = record(s)
    const heading = str(r.heading)
    const body = typeof r.body === "string" ? r.body : ""
    return heading || body.trim() ? [{ heading: heading ?? "", body }] : []
  })
}

const listSelect = { slug: true, title: true, category: true, summary: true, tags: true, publishedAt: true } as const

export const ResearchArticlesService = {
  async list(category?: ResearchCategory): Promise<ArticleListItem[]> {
    const rows = await prisma.researchArticle.findMany({
      where: { isPublished: true, ...(category ? { category } : {}) },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      take: ARTICLE_LIST_CAP,
      select: listSelect,
    })
    return ArticleListItemSchema.array().parse(rows.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null })))
  },

  async get(slug: string): Promise<ArticleDetail> {
    const row = await prisma.researchArticle.findFirst({
      where: { slug, isPublished: true },
      select: { ...listSelect, sections: true, body: true, references: true, updatedAt: true },
    })
    if (!row) throw new AppError("Article not found", 404)
    return ArticleDetailSchema.parse({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      sections: sectionsOf(row.sections),
      references: (Array.isArray(row.references) ? row.references : []).flatMap((r) => normalizeReference(r) ?? []),
    })
  },
}
