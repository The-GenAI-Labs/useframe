import { z } from "zod";
import { KNOWN_CAPABILITIES, PartialDesignTokensSchema } from "@repo/site-builder";

const CatalogStatusSchema = z.enum(["DRAFT", "ACTIVE", "RETIRED"]);

export const StyleTagSeedSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    label: z.string().min(1),
    description: z.string(),
    designTokens: PartialDesignTokensSchema,
    exemplarUrls: z.array(z.string().url()),
    requiresCapability: z.enum(KNOWN_CAPABILITIES).nullable(),
    compatibleWith: z.array(z.string()),
    avoidPatterns: z.array(z.string().min(1)),
    status: CatalogStatusSchema,
  })
  .strict()
  .refine((t) => t.status !== "ACTIVE" || t.description.trim().length > 0, {
    message: "ACTIVE style tags need a description",
  });
export type StyleTagSeed = z.infer<typeof StyleTagSeedSchema>;

export const StyleDirectiveSeedSchema = z
  .object({
    niche: z.string(),
    modelTarget: z.enum(["claude", "deepseek", "all"]),
    promptText: z.string(),
    referenceProducts: z.array(z.string().min(1)),
    avoidPatterns: z.array(z.string().min(1)),
    status: CatalogStatusSchema,
  })
  .strict()
  .refine((d) => d.status !== "ACTIVE" || d.promptText.trim().length > 0, {
    message: "ACTIVE style directives need promptText",
  });
export type StyleDirectiveSeed = z.infer<typeof StyleDirectiveSeedSchema>;

export function validateStyleTags(raw: unknown): StyleTagSeed[] {
  const tags = z.array(StyleTagSeedSchema).parse(raw);
  const errors: string[] = [];
  const byKey = new Map<string, StyleTagSeed>();

  for (const tag of tags) {
    if (byKey.has(tag.key)) errors.push(`duplicate style tag key "${tag.key}"`);
    byKey.set(tag.key, tag);
  }

  for (const tag of tags) {
    for (const other of tag.compatibleWith) {
      const target = byKey.get(other);
      if (other === tag.key) errors.push(`"${tag.key}" lists itself in compatibleWith`);
      else if (!target) errors.push(`"${tag.key}" lists unknown style tag "${other}"`);
      else if (!target.compatibleWith.includes(tag.key)) {
        errors.push(`compatibleWith is not symmetric: "${tag.key}" lists "${other}" but "${other}" does not list "${tag.key}"`);
      }
    }
  }

  if (errors.length) throw new Error(`Invalid style tag seed:\n- ${errors.join("\n- ")}`);
  return tags;
}

export function validateStyleDirectives<N extends string>(
  raw: unknown,
  niches: readonly N[],
): Array<Omit<StyleDirectiveSeed, "niche"> & { niche: N }> {
  const directives = z.array(StyleDirectiveSeedSchema).parse(raw);
  const errors: string[] = [];
  const seen = new Set<string>();
  const isNiche = (value: string): value is N => (niches as readonly string[]).includes(value);

  const typed = directives.flatMap((d) => {
    const key = `${d.niche}:${d.modelTarget}`;
    if (seen.has(key)) errors.push(`duplicate style directive for ${key}`);
    seen.add(key);
    if (!isNiche(d.niche)) {
      errors.push(`unknown niche "${d.niche}"`);
      return [];
    }
    return [{ ...d, niche: d.niche }];
  });

  if (errors.length) throw new Error(`Invalid style directive seed:\n- ${errors.join("\n- ")}`);
  return typed;
}
