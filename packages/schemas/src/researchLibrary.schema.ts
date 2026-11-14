import { z } from "zod"
import { ResearchCategoryEnum } from "./retrieval.schema.js"

export const LIBRARY_PAGE_SIZE = 20
export const LIBRARY_MAX_PAGE_SIZE = 50
export const LIBRARY_EXCERPT_CHARS = 200

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional())

export const LibraryListQuerySchema = z.object({
  category: z.preprocess((v) => (v === "" ? undefined : v), ResearchCategoryEnum.optional()),
  q: optionalText(200),
  tag: optionalText(64),
  cursor: optionalText(200),
  limit: z.coerce.number().int().min(1).max(LIBRARY_MAX_PAGE_SIZE).default(LIBRARY_PAGE_SIZE),
})
export type LibraryListQuery = z.infer<typeof LibraryListQuerySchema>

export const LibrarySlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(200) })

export const LibraryCategoryCountSchema = z.object({ category: ResearchCategoryEnum, count: z.number().int().nonnegative() })
export type LibraryCategoryCount = z.infer<typeof LibraryCategoryCountSchema>

const SourceYearVenueSchema = z.object({ year: z.number().int().nullable(), venue: z.string().nullable() })

// The only shape a locked user ever receives for a finding: no slug, statement, options or excerpt.
export const LockedFindingItemSchema = z.object({
  locked: z.literal(true),
  title: z.string(),
  category: ResearchCategoryEnum,
  source: SourceYearVenueSchema.nullable(),
})
export type LockedFindingItem = z.infer<typeof LockedFindingItemSchema>

export const FindingListItemSchema = z.object({
  locked: z.literal(false),
  slug: z.string(),
  title: z.string(),
  category: ResearchCategoryEnum,
  tags: z.array(z.string()),
  appliesWhen: z.string().nullable(),
  excerpt: z.string(),
  source: SourceYearVenueSchema.extend({ title: z.string(), authors: z.string().nullable() }).nullable(),
})
export type FindingListItem = z.infer<typeof FindingListItemSchema>

export const LibraryListResponseSchema = z.union([
  z.object({ locked: z.literal(true), items: z.array(LockedFindingItemSchema), nextCursor: z.string().nullable() }),
  z.object({ locked: z.literal(false), items: z.array(FindingListItemSchema), nextCursor: z.string().nullable() }),
])
export type LibraryListResponse = z.infer<typeof LibraryListResponseSchema>

export const FindingDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  category: ResearchCategoryEnum,
  tags: z.array(z.string()),
  appliesWhen: z.string().nullable(),
  statement: z.string(),
  reuseCount: z.number().int().nonnegative(),
  source: z
    .object({
      title: z.string(),
      authors: z.string().nullable(),
      year: z.number().int().nullable(),
      venue: z.string().nullable(),
      url: z.string().nullable(),
      doi: z.string().nullable(),
    })
    .nullable(),
  related: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      relationType: z.enum(["SUPPORTS", "CONFLICTS", "REFINES", "OFTEN_CITED_TOGETHER"]),
    }),
  ),
})
export type FindingDetail = z.infer<typeof FindingDetailSchema>

export const LibraryAccessSchema = z.object({
  hasFullAccess: z.boolean(),
  upgradePlanSlug: z.string().nullable(),
  upgradePlanName: z.string().nullable(),
})
export type LibraryAccess = z.infer<typeof LibraryAccessSchema>

export const ResearchReferenceSchema = z.object({
  title: z.string().nullable(),
  url: z.string().nullable(),
  authors: z.string().nullable(),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  doi: z.string().nullable(),
})
export type ResearchReference = z.infer<typeof ResearchReferenceSchema>

export const ArticleListItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  category: ResearchCategoryEnum,
  summary: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.string().nullable(),
})
export type ArticleListItem = z.infer<typeof ArticleListItemSchema>

export const ArticleDetailSchema = ArticleListItemSchema.extend({
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  body: z.string(),
  references: z.array(ResearchReferenceSchema),
  updatedAt: z.string(),
})
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>

export type ParsedFindingOption = { label: string; value: string; fits: string[] }
export type ParsedFindingStatement = { claim: string; options: ParsedFindingOption[] }

// The converter writes "claim\n\nOptions:\n- label: value (fits: a, b)"; anything else is plain text.
export function parseFindingStatement(statement: string): ParsedFindingStatement {
  const text = statement.replace(/\r\n/g, "\n")
  const match = /\n\s*\nOptions:\s*\n/.exec(text)
  if (!match) return { claim: text.trim(), options: [] }
  const options = text
    .slice(match.index + match[0].length)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      let rest = line.slice(2).trim()
      let fits: string[] = []
      const fitsMatch = /\s*\(fits:\s*([^)]*)\)\s*$/.exec(rest)
      if (fitsMatch) {
        fits = fitsMatch[1]!.split(",").map((f) => f.trim()).filter(Boolean)
        rest = rest.slice(0, fitsMatch.index).trim()
      }
      const colon = rest.indexOf(": ")
      return colon < 0
        ? { label: rest, value: "", fits }
        : { label: rest.slice(0, colon).trim(), value: rest.slice(colon + 2).trim(), fits }
    })
  return { claim: text.slice(0, match.index).trim(), options }
}
