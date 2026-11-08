import { z } from "zod";
import type { Prisma } from "@useframe/db";
import { ResearchCategoryEnum } from "@repo/schemas";
import { SlugSchema, canonicalJson } from "./findingFile.js";

export const ArticleFileSchema = z
  .object({
    slug: SlugSchema,
    title: z.string().trim().min(1),
    kind: z.literal("ARTICLE"),
    category: ResearchCategoryEnum,
    summary: z.string().trim().min(1),
    sections: z.array(
      z.object({ heading: z.string(), body: z.string() }).passthrough(),
    ),
    body: z.string().trim().min(1),
    tags: z.array(z.string()),
    references: z.array(z.object({}).passthrough()),
    isPublished: z.literal(true),
  })
  .strict();
export type ArticleFile = z.infer<typeof ArticleFileSchema>;

const COMPARED = [
  "title",
  "kind",
  "category",
  "summary",
  "sections",
  "body",
  "tags",
  "references",
  "isPublished",
] as const;

export function articleData(
  file: ArticleFile,
): Omit<Prisma.ResearchArticleUncheckedCreateInput, "publishedAt"> {
  return {
    slug: file.slug,
    title: file.title,
    kind: file.kind,
    category: file.category,
    summary: file.summary,
    sections: file.sections as Prisma.InputJsonValue,
    body: file.body,
    tags: file.tags,
    references: file.references as Prisma.InputJsonValue,
    isPublished: file.isPublished,
  };
}

export interface ArticleStore {
  find(slug: string): Promise<Record<string, unknown> | null>;
  create(data: Prisma.ResearchArticleUncheckedCreateInput): Promise<void>;
  update(
    slug: string,
    data: Omit<Prisma.ResearchArticleUncheckedCreateInput, "publishedAt">,
  ): Promise<void>;
}

export function prismaArticleStore(
  db: typeof import("@useframe/db").prisma,
): ArticleStore {
  return {
    find: (slug) => db.researchArticle.findUnique({ where: { slug } }),
    create: async (data) => {
      await db.researchArticle.create({ data });
    },
    update: async (slug, data) => {
      await db.researchArticle.update({ where: { slug }, data });
    },
  };
}

export async function importArticles(
  store: ArticleStore,
  files: ArticleFile[],
  options: { dryRun: boolean; now?: Date },
) {
  const counts = { created: 0, updated: 0, unchanged: 0 };
  for (const file of files) {
    const data = articleData(file);
    const existing = await store.find(file.slug);
    if (!existing) {
      counts.created++;
      if (!options.dryRun)
        await store.create({ ...data, publishedAt: options.now ?? new Date() });
      continue;
    }
    const same = COMPARED.every(
      (field) =>
        canonicalJson(existing[field] ?? null) ===
        canonicalJson(data[field] ?? null),
    );
    if (same) counts.unchanged++;
    else {
      counts.updated++;
      if (!options.dryRun) await store.update(file.slug, data);
    }
  }
  return counts;
}
