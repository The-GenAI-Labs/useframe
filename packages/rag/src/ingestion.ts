import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { prisma, type Prisma, type IngestionOutcome } from "@useframe/db";
import { chunkStatement } from "./chunker.js";
import {
  embeddingText,
  findingHashes,
  parseFindingFile,
  type FindingFile,
} from "./findingFile.js";
import { voyageProvider, type EmbeddingProvider } from "./embeddings.js";
import { corpusStorage, type CorpusStorage } from "./storage.js";
import { ProviderError } from "./http.js";
import { ResearchTrace } from "./tracing.js";

export const CorpusEventSchema = z.object({
  bucketId: z.string().min(1),
  objectId: z.string().regex(/^findings\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/),
  objectGeneration: z.string().regex(/^\d+$/),
  eventType: z.enum([
    "OBJECT_FINALIZE",
    "OBJECT_DELETE",
    "OBJECT_ARCHIVE",
    "CLI",
  ]),
  overwrittenByGeneration: z.string().regex(/^\d+$/).optional(),
});
export type CorpusEvent = z.infer<typeof CorpusEventSchema>;
export type IngestionResult = {
  outcome: IngestionOutcome;
  findingId?: string;
  chunkCount?: number;
  errors?: unknown;
};
type IngestOptions = {
  storage?: CorpusStorage;
  embedder?: EmbeddingProvider;
  db?: typeof prisma;
  finalAttempt?: boolean;
  forceReembed?: boolean;
  localText?: string;
};
export function corpusJobId(event: CorpusEvent) {
  return `${event.objectId}#${event.objectGeneration}#${event.eventType}`;
}
export function isTransient(error: unknown): boolean {
  if (error instanceof ProviderError) return error.retryable;
  if (error instanceof z.ZodError) return false;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (["P2002", "P2003", "P2025", "400", "401", "403"].includes(code))
    return false;
  return (
    [
      "P2034",
      "P2028",
      "P1001",
      "P1002",
      "P1017",
      "40001",
      "40P01",
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "429",
      "500",
      "502",
      "503",
      "504",
    ].includes(code) ||
    error instanceof TypeError ||
    (error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name))
  );
}
const newer = (a: string, b: string) => BigInt(a) > BigInt(b);

async function saveSource(
  tx: Prisma.TransactionClient,
  source: FindingFile["source"],
) {
  if (!source) return null;
  for (const identity of [source.doi, source.url]
    .filter((v): v is string => !!v)
    .sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`source:${identity}`}))::text`;
  }
  const existing = source.doi
    ? await tx.sourceDocument.findUnique({ where: { doi: source.doi } })
    : null;
  const byUrl = source.url
    ? await tx.sourceDocument.findUnique({ where: { url: source.url } })
    : null;
  if (existing && byUrl && existing.id !== byUrl.id)
    throw new ProviderError(
      "Source DOI and URL refer to different records",
      false,
    );
  const data = {
    ...source,
    authors: source.authors ?? null,
    year: source.year ?? null,
    venue: source.venue ?? null,
    url: source.url ?? null,
    doi: source.doi ?? null,
  };
  const row = existing ?? byUrl;
  return (
    row
      ? await tx.sourceDocument.update({ where: { id: row.id }, data })
      : await tx.sourceDocument.create({ data })
  ).id;
}

export async function ingestFinding(
  rawEvent: CorpusEvent,
  options: IngestOptions = {},
): Promise<IngestionResult> {
  const event = CorpusEventSchema.parse(rawEvent);
  const db = options.db ?? prisma;
  const storage = options.storage ?? corpusStorage(event.bucketId);
  const embedder = options.embedder ?? voyageProvider();
  const slug = event.objectId.slice("findings/".length, -5);
  const trace = new ResearchTrace("corpus.ingest", {
    objectKey: event.objectId,
    generation: event.objectGeneration,
  });
  const started = Date.now();
  async function run(): Promise<IngestionResult> {
    if (
      event.eventType === "OBJECT_DELETE" ||
      event.eventType === "OBJECT_ARCHIVE"
    ) {
      if (event.overwrittenByGeneration)
        return { outcome: "SKIPPED_OVERWRITTEN" };
      const live = await storage.currentGeneration(event.objectId);
      if (live && newer(live, event.objectGeneration))
        return { outcome: "SKIPPED_STALE_GENERATION" };
      return db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${slug}))::text`;
          const existing = await tx.researchFinding.findUnique({
            where: { slug },
          });
          if (existing && newer(existing.gcsGeneration, event.objectGeneration))
            return { outcome: "SKIPPED_STALE_GENERATION" };
          // Keep a tombstone even when DELETE arrives before its FINALIZE.
          const row = await tx.researchFinding.upsert({
            where: { slug },
            create: {
              slug,
              status: "RETIRED",
              title: slug,
              statement: "",
              tags: [],
              appliesTo: [],
              audience: [],
              verified: false,
              contentHash: "",
              embeddingHash: "",
              gcsObjectKey: event.objectId,
              gcsGeneration: event.objectGeneration,
            },
            update: {
              status: "RETIRED",
              verified: false,
              gcsGeneration: event.objectGeneration,
            },
          });
          await tx.findingChunk.deleteMany({ where: { findingId: row.id } });
          await tx.pendingFindingRelation.deleteMany({
            where: { sourceFindingId: row.id },
          });
          await tx.$executeRaw`UPDATE corpus_version SET version = version + 1 WHERE id = 1`;
          return { outcome: "RETIRED", findingId: row.id };
        },
        { timeout: 30000 },
      );
    }
    if (!options.localText) {
      const current = await trace.span("download.metadata", {}, () =>
        storage.currentGeneration(event.objectId),
      );
      if (!current || newer(current, event.objectGeneration))
        return { outcome: "SKIPPED_STALE_GENERATION" };
    }
    let file: FindingFile;
    try {
      const text =
        options.localText ??
        (await trace.span(
          "download",
          {},
          () => storage.download(event.objectId, event.objectGeneration),
          (text) => ({ bytes: Buffer.byteLength(text) }),
        ));
      file = await trace.span(
        "validate",
        {},
        async () => parseFindingFile(JSON.parse(text), event.objectId),
        (f) => ({ slug: f.slug, status: f.status }),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        Number(error.code) === 404 &&
        options.localText === undefined
      ) {
        const current = await storage.currentGeneration(event.objectId);
        if (!current || newer(current, event.objectGeneration))
          return { outcome: "SKIPPED_STALE_GENERATION" };
      }
      if (
        error instanceof SyntaxError ||
        error instanceof z.ZodError ||
        (error instanceof Error &&
          error.message === "slug must equal the JSON filename")
      )
        return {
          outcome: "INVALID",
          errors: error instanceof z.ZodError ? error.issues : String(error),
        };
      throw error;
    }
    const hashes = findingHashes(file, embedder.model, embedder.dims);
    const previous = await db.researchFinding.findUnique({
      where: { slug },
      include: { chunks: { select: { embeddingModel: true } } },
    });
    if (
      previous &&
      (newer(previous.gcsGeneration, event.objectGeneration) ||
        (previous.status === "RETIRED" &&
          previous.gcsGeneration === event.objectGeneration))
    )
      return { outcome: "SKIPPED_STALE_GENERATION" };
    const needsEmbedding =
      options.forceReembed ||
      !previous ||
      previous.embeddingHash !== hashes.embeddingHash ||
      !previous.chunks.length ||
      previous.chunks.some((c) => c.embeddingModel !== embedder.model);
    const chunks = await trace.span(
      "chunk",
      {},
      async () => chunkStatement(file.statement),
      (chunks) => ({ count: chunks.length }),
    );
    const texts = chunks.map((c) => embeddingText(file, c.chunkText));
    const vectors = needsEmbedding
      ? await trace.span(
          "embed",
          { batchSize: texts.length, model: embedder.model },
          () => embedder.embedDocuments(texts),
          (vectors) => ({ count: vectors.length }),
        )
      : null;
    if (
      vectors &&
      (vectors.length !== chunks.length ||
        vectors.some(
          (v) =>
            v.length !== embedder.dims || v.some((n) => !Number.isFinite(n)),
        ))
    )
      throw new ProviderError(
        "Invalid embedding dimensions or batch length",
        false,
      );
    if (!options.localText) {
      const current = await storage.currentGeneration(event.objectId);
      if (!current || newer(current, event.objectGeneration))
        return { outcome: "SKIPPED_STALE_GENERATION" };
    }
    return trace.span("db.write", {}, () =>
      db.$transaction(
        async (tx) => {
          // Lock all declared endpoints in a stable order so opposite upload orders resolve pending edges.
          for (const key of [
            ...new Set([slug, ...file.relations.map((r) => r.slug)]),
          ].sort())
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
          const current = await tx.researchFinding.findUnique({
            where: { slug },
            include: { chunks: { select: { embeddingModel: true } } },
          });
          if (
            current &&
            (newer(current.gcsGeneration, event.objectGeneration) ||
              (current.status === "RETIRED" &&
                current.gcsGeneration === event.objectGeneration))
          )
            return { outcome: "SKIPPED_STALE_GENERATION" };
          if (current?.contentHash === hashes.contentHash && !needsEmbedding) {
            await tx.researchFinding.update({
              where: { id: current.id },
              data: { gcsGeneration: event.objectGeneration },
            });
            return {
              outcome: "SKIPPED_UNCHANGED",
              findingId: current.id,
              chunkCount: current.chunks.length,
            };
          }
          // Another generation may have changed chunks while embedding ran outside the transaction.
          if (!vectors && current?.embeddingHash !== hashes.embeddingHash)
            throw Object.assign(new Error("Corpus changed concurrently"), {
              code: "P2034",
            });
          const sourceDocumentId = await saveSource(tx, file.source);
          const data = {
            title: file.title,
            statement: file.statement,
            category: file.category,
            status: file.status,
            tags: file.tags,
            appliesWhen: file.appliesWhen ?? null,
            confidenceScore: file.confidenceScore ?? null,
            effectSize: file.effectSize ?? null,
            sourceDocumentId,
            sourceExcerpt: file.sourceExcerpt ?? null,
            sourceLocator: file.sourceLocator ?? null,
            ...hashes,
            gcsObjectKey: event.objectId,
            gcsGeneration: event.objectGeneration,
            verifiedAt:
              file.status === "VERIFIED"
                ? (current?.verifiedAt ?? new Date())
                : null,
            claim: file.statement,
            contextHeader: file.title,
            paper: file.source?.title ?? "",
            verified: file.status === "VERIFIED",
            field: file.category.toLowerCase(),
          };
          const finding = await tx.researchFinding.upsert({
            where: { slug },
            create: { slug, ...data, appliesTo: [], audience: [] },
            update: data,
          });
          if (vectors) {
            await tx.findingChunk.deleteMany({
              where: { findingId: finding.id },
            });
            for (const [i, chunk] of chunks.entries()) {
              const vector = `[${vectors[i]!.join(",")}]`;
              await tx.$executeRaw`INSERT INTO finding_chunks (id, "findingId", "chunkIndex", "chunkText", "embeddingText", "wordCount", "embeddingModel", embedding) VALUES (${createId()}, ${finding.id}, ${i}, ${chunk.chunkText}, ${texts[i]!}, ${chunk.wordCount}, ${embedder.model}, ${vector}::vector)`;
            }
          }
          await tx.findingRelation.deleteMany({
            where: { findingId: finding.id },
          });
          await tx.pendingFindingRelation.deleteMany({
            where: { sourceFindingId: finding.id },
          });
          for (const relation of file.relations) {
            const target = await tx.researchFinding.findUnique({
              where: { slug: relation.slug },
              select: { id: true },
            });
            if (target)
              await tx.findingRelation.upsert({
                where: {
                  findingId_relatedFindingId_relationType: {
                    findingId: finding.id,
                    relatedFindingId: target.id,
                    relationType: relation.type,
                  },
                },
                create: {
                  findingId: finding.id,
                  relatedFindingId: target.id,
                  relationType: relation.type,
                  note: relation.note,
                },
                update: { note: relation.note },
              });
            else
              await tx.pendingFindingRelation.upsert({
                where: {
                  sourceFindingId_targetSlug_relationType: {
                    sourceFindingId: finding.id,
                    targetSlug: relation.slug,
                    relationType: relation.type,
                  },
                },
                create: {
                  sourceFindingId: finding.id,
                  targetSlug: relation.slug,
                  relationType: relation.type,
                  note: relation.note,
                },
                update: { note: relation.note },
              });
          }
          const pending = await tx.pendingFindingRelation.findMany({
            where: { targetSlug: slug },
          });
          for (const relation of pending) {
            if (
              await tx.researchFinding.findUnique({
                where: { id: relation.sourceFindingId },
                select: { id: true },
              })
            )
              await tx.findingRelation.upsert({
                where: {
                  findingId_relatedFindingId_relationType: {
                    findingId: relation.sourceFindingId,
                    relatedFindingId: finding.id,
                    relationType: relation.relationType,
                  },
                },
                create: {
                  findingId: relation.sourceFindingId,
                  relatedFindingId: finding.id,
                  relationType: relation.relationType,
                  note: relation.note,
                },
                update: { note: relation.note },
              });
            await tx.pendingFindingRelation.delete({
              where: { id: relation.id },
            });
          }
          await tx.$executeRaw`UPDATE corpus_version SET version = version + 1 WHERE id = 1`;
          return {
            outcome: "SUCCESS",
            findingId: finding.id,
            chunkCount: chunks.length,
          };
        },
        { timeout: 30000 },
      ),
    );
  }
  let result: IngestionResult;
  try {
    result = await run();
  } catch (error) {
    if (isTransient(error) && options.finalAttempt === false) {
      await trace.finish("RETRY");
      throw error;
    }
    result = {
      outcome: "FAILED",
      errors: error instanceof Error ? error.message : "Ingestion failed",
    };
  }
  try {
    await db.corpusIngestionLog.create({
      data: {
        objectKey: event.objectId,
        generation: event.objectGeneration,
        eventType: event.eventType,
        outcome: result.outcome,
        findingId: result.findingId,
        chunkCount: result.chunkCount,
        durationMs: Date.now() - started,
        ...(result.errors
          ? {
              errors: JSON.parse(
                JSON.stringify(result.errors),
              ) as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    await storage.report(event.objectId, {
      ...result,
      generation: event.objectGeneration,
      durationMs: Date.now() - started,
    });
  } finally {
    await trace.finish(result.outcome);
  }
  return result;
}
