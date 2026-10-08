import { z } from "zod"
import { STEP_IDS, type FieldId, type StepId } from "./catalog.js"
import type { BriefMeta } from "./provenance.js"
import type { BriefData, BriefFieldErrors } from "./schema.js"
import type { BriefWarning, OmittedSection } from "./serialize.js"

export const BRIEF_STATUSES = ["DRAFT", "RESOLVING", "AWAITING_REVIEW", "APPROVED"] as const
export type BriefStatus = (typeof BRIEF_STATUSES)[number]
export const BRIEF_MODES = ["QUICK", "FULL"] as const
export type BriefMode = (typeof BRIEF_MODES)[number]

export const BriefStepPointerSchema = z.union([z.enum(STEP_IDS), z.enum(["start", "summary"])])
export type BriefStepPointer = StepId | "start" | "summary"

export const CreateBriefSchema = z
  .object({
    ideaText: z.string().trim().max(2000).optional(),
    mode: z.enum(BRIEF_MODES).optional(),
  })
  .strict()
export type CreateBriefInput = z.infer<typeof CreateBriefSchema>

const fieldKey = z.string().min(1).max(40)

export const PatchBriefSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    set: z.record(fieldKey, z.unknown()).optional(),
    unset: z.array(fieldKey).max(60).optional(),
    aiDecide: z.record(fieldKey, z.boolean()).optional(),
    mode: z.enum(BRIEF_MODES).optional(),
    currentStep: BriefStepPointerSchema.optional(),
  })
  .strict()
export type PatchBriefInput = z.infer<typeof PatchBriefSchema>

export const PrefillBriefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(20_000) }).strict(),
  z.object({ kind: z.literal("url"), url: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("doc"), uploadId: z.string().cuid() }).strict(),
])
export type PrefillBriefInput = z.infer<typeof PrefillBriefSchema>

export const ApproveBriefSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmedPaths: z.array(fieldKey).max(20),
  })
  .strict()
export type ApproveBriefInput = z.infer<typeof ApproveBriefSchema>

export const CreateProjectFromBriefSchema = z.object({ briefId: z.string().cuid() }).strict()
export type CreateProjectFromBriefInput = z.infer<typeof CreateProjectFromBriefSchema>

export const BRIEF_UPLOAD_FIELDS = ["logo", "sourceDocument"] as const
export type BriefUploadField = (typeof BRIEF_UPLOAD_FIELDS)[number]

export const BriefUploadQuerySchema = z
  .object({
    field: z.enum(BRIEF_UPLOAD_FIELDS),
    name: z.string().max(200).optional(),
  })
  .strict()

export type BriefResolution = {
  notice?: string
  dropped?: FieldId[]
  // Built server-side from a legacy POST /projects body; the pipeline keeps
  // reading that project's own columns until the brief is edited.
  origin?: "legacy"
}

export const BRIEF_IDEA_PREFILL_MIN_CHARS = 120

export function composeRawIdea(data: { productName?: string; oneLiner?: string; problem?: string }): string {
  return `${data.productName ?? ""}: ${data.oneLiner ?? ""} Problem: ${data.problem ?? ""}`.slice(0, 1000)
}

export type BriefView = {
  id: string
  projectId: string | null
  status: BriefStatus
  mode: BriefMode
  currentStep: BriefStepPointer | null
  version: number
  catalogVersion: number
  data: BriefData
  meta: BriefMeta
  warnings: BriefWarning[]
  omitted: OmittedSection[]
  needsConfirmation: FieldId[]
  resolution: BriefResolution
  uploads: { logo?: { url: string }; sourceDocument?: { name?: string } }
  latestRevision: { id: string; version: number; reason: string; createdAt: string } | null
  lastPrefillAt: string | null
  updatedAt: string
}

export type BriefDraftSummary = {
  id: string
  productName: string | null
  currentStep: BriefStepPointer | null
  updatedAt: string
}

export type BriefErrorBody = {
  success: false
  message: string
  code?: string
  errors?: BriefFieldErrors
  data?: unknown
}
