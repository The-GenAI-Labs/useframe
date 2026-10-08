import {
  applyBriefChanges,
  type BriefChanges,
  type BriefData,
  type BriefMeta,
  type SchemaMode,
  type Source,
  type FieldId,
} from "@repo/schemas"
import { prisma, type Prisma } from "./index.js"
import type { ProjectBrief, BriefRevision } from "../prisma/generated/client.js"

export class BriefNotFoundError extends Error {
  constructor() {
    super("Brief not found")
    this.name = "BriefNotFoundError"
  }
}

export class BriefConflictError extends Error {
  constructor(readonly current: ProjectBrief) {
    super("This brief changed somewhere else")
    this.name = "BriefConflictError"
  }
}

export type BriefRow = ProjectBrief

export function briefStateOf(row: Pick<ProjectBrief, "data" | "meta">): { data: BriefData; meta: BriefMeta } {
  return {
    data: (row.data ?? {}) as BriefData,
    meta: (row.meta ?? {}) as BriefMeta,
  }
}

export type WriteBriefParams = {
  briefId: string
  // Scope for user-facing callers; services acting on an already
  // authorized brief may omit it.
  userId?: string
  changes: BriefChanges
  source: Source
  expectedVersion?: number
  mode?: SchemaMode
  strictProof?: boolean
  confidence?: Partial<Record<FieldId, number>>
  citations?: Partial<Record<FieldId, { url: string; title?: string }[]>>
  excerpts?: Partial<Record<FieldId, string>>
  columns?: Omit<Prisma.ProjectBriefUpdateInput, "data" | "meta" | "version" | "user" | "revisions" | "uploads">
  revisionReason?: "APPROVED" | "EDITED"
}

export type WriteBriefResult = {
  brief: ProjectBrief
  changed: FieldId[]
  skipped: FieldId[]
  revision: BriefRevision | null
}

// The single write path for ProjectBrief.data/meta: validates against the
// catalog, enforces the proof/claim rules, stamps provenance and bumps the
// optimistic-concurrency version, all under a row lock.
export async function writeBriefFields(params: WriteBriefParams): Promise<WriteBriefResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM project_briefs WHERE id = ${params.briefId} FOR UPDATE`
      const current = await tx.projectBrief.findFirst({
        where: { id: params.briefId, ...(params.userId ? { userId: params.userId } : {}) },
      })
      if (!current) throw new BriefNotFoundError()
      if (params.expectedVersion !== undefined && params.expectedVersion !== current.version) {
        throw new BriefConflictError(current)
      }

      const applied = applyBriefChanges(briefStateOf(current), params.changes, {
        source: params.source,
        mode: params.mode,
        strictProof: params.strictProof,
        confidence: params.confidence,
        citations: params.citations,
        excerpts: params.excerpts,
      })

      const nextVersion = current.version + 1
      const brief = await tx.projectBrief.update({
        where: { id: current.id },
        data: {
          ...params.columns,
          data: applied.data as Prisma.InputJsonValue,
          meta: applied.meta as Prisma.InputJsonValue,
          version: nextVersion,
        },
      })

      const revision = params.revisionReason
        ? await tx.briefRevision.create({
            data: {
              briefId: brief.id,
              version: nextVersion,
              data: applied.data as Prisma.InputJsonValue,
              meta: applied.meta as Prisma.InputJsonValue,
              reason: params.revisionReason,
            },
          })
        : null

      return { brief, changed: applied.changed, skipped: applied.skipped, revision }
    },
    { timeout: 15_000 },
  )
}

export async function latestBriefRevision(briefId: string): Promise<BriefRevision | null> {
  return prisma.briefRevision.findFirst({ where: { briefId }, orderBy: { version: "desc" } })
}
