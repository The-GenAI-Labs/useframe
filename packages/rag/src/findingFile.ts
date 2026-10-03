import { z } from "zod";
import { createHash } from "node:crypto";
import { ResearchCategoryEnum } from "@repo/schemas";

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
export const RelationTypeSchema = z.enum([
  "SUPPORTS",
  "CONFLICTS",
  "REFINES",
  "OFTEN_CITED_TOGETHER",
]);
export const SourceSchema = z
  .object({
    title: z.string().trim().min(1),
    authors: z.string().nullable().optional(),
    year: z.number().int().min(1).max(9999).nullable().optional(),
    venue: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    doi: z.string().trim().min(1).nullable().optional(),
    rawTextKey: z.string().optional(),
    tokenCount: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((s) => !!s.url || !!s.doi, "A source requires a DOI or URL");
export const FindingFileSchema = z
  .object({
    slug: SlugSchema,
    status: z.enum(["DRAFT", "VERIFIED"]),
    category: ResearchCategoryEnum,
    title: z
      .string()
      .min(1)
      .max(120)
      .refine((v) => !!v.trim()),
    statement: z
      .string()
      .min(1)
      .refine((v) => !!v.trim()),
    appliesWhen: z.string().nullable().optional(),
    tags: z
      .array(
        z
          .string()
          .min(1)
          .refine(
            (v) => v === v.toLowerCase() && v === v.trim(),
            "Tags must be lowercase and trimmed",
          ),
      )
      .max(12),
    confidenceScore: z.number().min(0).max(1).nullable().optional(),
    effectSize: z.string().nullable().optional(),
    source: SourceSchema.optional(),
    sourceExcerpt: z.string().nullable().optional(),
    sourceLocator: z.string().nullable().optional(),
    relations: z
      .array(
        z
          .object({
            slug: SlugSchema,
            type: RelationTypeSchema,
            note: z.string().nullable().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.status === "VERIFIED" && !f.source)
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: "VERIFIED findings require a source",
      });
    if (f.relations.some((r) => r.slug === f.slug))
      ctx.addIssue({
        code: "custom",
        path: ["relations"],
        message: "A finding cannot relate to itself",
      });
  });
export type FindingFile = z.infer<typeof FindingFileSchema>;
export function parseFindingFile(
  input: unknown,
  objectKey: string,
): FindingFile {
  const f = FindingFileSchema.parse(input);
  if (objectKey !== `findings/${f.slug}.json`)
    throw new Error("slug must equal the JSON filename");
  return f;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function findingHashes(f: FindingFile, model: string, dims: number) {
  return {
    contentHash: sha256(canonicalJson(f)),
    embeddingHash: sha256(
      canonicalJson({
        title: f.title,
        statement: f.statement,
        appliesWhen: f.appliesWhen ?? "",
        tags: [...f.tags].sort(),
        model,
        dims,
      }),
    ),
  };
}
export function embeddingText(
  f: Pick<FindingFile, "title" | "appliesWhen" | "tags">,
  chunkText: string,
): string {
  return [
    `${f.title}.`,
    chunkText,
    f.appliesWhen ? `Applies to: ${f.appliesWhen}` : "",
    f.tags.length ? `Tags: ${[...f.tags].sort().join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
