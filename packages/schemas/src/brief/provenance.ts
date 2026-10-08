import { z } from "zod"
import { FIELD_IDS, type FieldId } from "./catalog.js"

export const BRIEF_SOURCES = ["user", "imported", "researched", "assumed", "default"] as const
export const SourceSchema = z.enum(BRIEF_SOURCES)
export type Source = z.infer<typeof SourceSchema>

export const CitationRefSchema = z
  .object({ url: z.string().max(2000), title: z.string().max(300).optional() })
  .strict()

export const FieldMetaSchema = z
  .object({
    source: SourceSchema,
    confirmed: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
    citations: z.array(CitationRefSchema).max(10).optional(),
    excerpt: z.string().max(200).optional(),
    aiDecide: z.boolean().optional(),
    updatedAt: z.string(),
  })
  .strict()
export type FieldMeta = z.infer<typeof FieldMetaSchema>

export const BriefMetaSchema = z
  .object(Object.fromEntries(FIELD_IDS.map((id) => [id, FieldMetaSchema])) as Record<FieldId, typeof FieldMetaSchema>)
  .partial()
  .strict()
export type BriefMeta = Partial<Record<FieldId, FieldMeta>>

export const PROOF_SOURCES: readonly Source[] = ["user", "imported"]
