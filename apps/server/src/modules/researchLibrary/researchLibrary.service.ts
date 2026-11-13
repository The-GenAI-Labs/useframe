import { prisma } from "@useframe/db"
import {
  FindingDetailSchema,
  LIBRARY_EXCERPT_CHARS,
  LibraryAccessSchema,
  LibraryCategoryCountSchema,
  LibraryListResponseSchema,
  parseFindingStatement,
  type FindingDetail,
  type LibraryAccess,
  type LibraryCategoryCount,
  type LibraryListQuery,
  type LibraryListResponse,
} from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"
import { hasFullResearchAccess, isFindingCitedInOwnProject, researchUpgradePlan } from "@/lib/researchAccess.js"

type LockedRow = { slug: string; title: string; category: string; year: number | null; venue: string | null }
type FullRow = LockedRow & {
  tags: string[]
  appliesWhen: string | null
  statement: string
  sourceTitle: string | null
  authors: string | null
}

function excerpt(statement: string): string {
  const { claim } = parseFindingStatement(statement)
  return claim.length > LIBRARY_EXCERPT_CHARS ? `${claim.slice(0, LIBRARY_EXCERPT_CHARS).trimEnd()}…` : claim
}

export const ResearchLibraryService = {
  async categories(): Promise<LibraryCategoryCount[]> {
    const groups = await prisma.researchFinding.groupBy({
      by: ["category"],
      where: { status: "VERIFIED" },
      _count: { _all: true },
      orderBy: { category: "asc" },
    })
    return LibraryCategoryCountSchema.array().parse(groups.map((g) => ({ category: g.category, count: g._count._all })))
  },

  async access(userId: string): Promise<LibraryAccess> {
    const [hasFullAccess, plan] = await Promise.all([hasFullResearchAccess(userId), researchUpgradePlan()])
    return LibraryAccessSchema.parse({
      hasFullAccess,
      upgradePlanSlug: hasFullAccess ? null : (plan?.slug ?? null),
      upgradePlanName: hasFullAccess ? null : (plan?.name ?? null),
    })
  },

  async list(userId: string, query: LibraryListQuery): Promise<LibraryListResponse> {
    const full = await hasFullResearchAccess(userId)
    const category = query.category ?? null
    const tag = query.tag ?? null
    const q = query.q ?? null
    const cursor = query.cursor ?? null
    const take = query.limit + 1

    // Locked users search only weight-A lexemes (title and tags) and never select the statement.
    const rows: Array<LockedRow | FullRow> = full
      ? await prisma.$queryRaw<FullRow[]>`
          SELECT f.slug, f.title, f.category::text AS category, f.tags, f."appliesWhen", f.statement,
                 s.title AS "sourceTitle", s.authors, s.year, s.venue
          FROM research_findings f LEFT JOIN source_documents s ON s.id = f."sourceDocumentId"
          WHERE f.status = 'VERIFIED'
            AND (${category}::text IS NULL OR f.category::text = ${category}::text)
            AND (${tag}::text IS NULL OR ${tag}::text = ANY(f.tags))
            AND (${q}::text IS NULL OR f."searchVector" @@ plainto_tsquery('english', ${q}::text))
            AND (${cursor}::text IS NULL OR f.slug > ${cursor}::text)
          ORDER BY f.slug ASC
          LIMIT ${take}`
      : await prisma.$queryRaw<LockedRow[]>`
          SELECT f.slug, f.title, f.category::text AS category, s.year, s.venue
          FROM research_findings f LEFT JOIN source_documents s ON s.id = f."sourceDocumentId"
          WHERE f.status = 'VERIFIED'
            AND (${category}::text IS NULL OR f.category::text = ${category}::text)
            AND (${tag}::text IS NULL OR ${tag}::text = ANY(f.tags))
            AND (${q}::text IS NULL OR ts_filter(f."searchVector", '{a}') @@ plainto_tsquery('english', ${q}::text))
            AND (${cursor}::text IS NULL OR f.slug > ${cursor}::text)
          ORDER BY f.slug ASC
          LIMIT ${take}`

    const page = rows.slice(0, query.limit)
    const last = rows.length > query.limit ? page[page.length - 1]!.slug : null
    const nextCursor = last ? Buffer.from(last).toString("base64url") : null
    const hasSource = (r: LockedRow) => r.year !== null || r.venue !== null

    if (!full) {
      return LibraryListResponseSchema.parse({
        locked: true,
        nextCursor,
        items: page.map((r) => ({
          locked: true,
          title: r.title,
          category: r.category,
          source: hasSource(r) ? { year: r.year, venue: r.venue } : null,
        })),
      })
    }
    return LibraryListResponseSchema.parse({
      locked: false,
      nextCursor,
      items: (page as FullRow[]).map((r) => ({
        locked: false,
        slug: r.slug,
        title: r.title,
        category: r.category,
        tags: r.tags,
        appliesWhen: r.appliesWhen,
        excerpt: excerpt(r.statement),
        source:
          r.sourceTitle === null
            ? null
            : { title: r.sourceTitle, authors: r.authors, year: r.year, venue: r.venue },
      })),
    })
  },

  async detail(userId: string, slug: string): Promise<FindingDetail> {
    const finding = await prisma.researchFinding.findFirst({
      where: { slug, status: "VERIFIED" },
      select: { id: true },
    })
    if (!finding) throw new AppError("Finding not found", 404)

    const allowed = (await hasFullResearchAccess(userId)) || (await isFindingCitedInOwnProject(userId, finding.id))
    if (!allowed) throw new AppError("This finding is part of the full research library", 403, "RESEARCH_LOCKED")

    const row = await prisma.researchFinding.findUniqueOrThrow({
      where: { id: finding.id },
      select: {
        slug: true,
        title: true,
        category: true,
        tags: true,
        appliesWhen: true,
        statement: true,
        reuseCount: true,
        source: { select: { title: true, authors: true, year: true, venue: true, url: true, doi: true } },
        relationsFrom: {
          where: { relatedFinding: { status: "VERIFIED" } },
          select: { relationType: true, relatedFinding: { select: { slug: true, title: true } } },
        },
        relationsTo: {
          where: { finding: { status: "VERIFIED" } },
          select: { relationType: true, finding: { select: { slug: true, title: true } } },
        },
      },
    })

    const related = new Map<string, FindingDetail["related"][number]>()
    for (const r of row.relationsFrom) related.set(r.relatedFinding.slug, { ...r.relatedFinding, relationType: r.relationType })
    for (const r of row.relationsTo) if (!related.has(r.finding.slug)) related.set(r.finding.slug, { ...r.finding, relationType: r.relationType })
    related.delete(row.slug)

    return FindingDetailSchema.parse({
      slug: row.slug,
      title: row.title,
      category: row.category,
      tags: row.tags,
      appliesWhen: row.appliesWhen,
      statement: row.statement,
      reuseCount: row.reuseCount,
      source: row.source,
      related: [...related.values()].sort((a, b) => a.title.localeCompare(b.title)),
    })
  },
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined
  const decoded = Buffer.from(cursor, "base64url").toString("utf8")
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(decoded) || decoded.length > 180) throw new AppError("Invalid cursor", 422)
  return decoded
}
