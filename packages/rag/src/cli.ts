import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@useframe/db";
import { QUEUES } from "@repo/events";
import { parseFindingFile, type FindingFile } from "./findingFile.js";
import { ingestFinding, corpusJobId, type CorpusEvent } from "./ingestion.js";
import { corpusStorage, type CorpusStorage } from "./storage.js";
import { assertEmbeddingDimensions } from "./embeddings.js";
import { ragConfig } from "./config.js";

async function localFiles(directory: string) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((f) => f.isFile() && f.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => join(directory, f.name));
}
async function validate(directory: string) {
  const valid: Array<{ path: string; file: FindingFile }> = [];
  let failures = 0;
  for (const path of await localFiles(directory)) {
    try {
      valid.push({
        path,
        file: parseFindingFile(
          JSON.parse(await readFile(path, "utf8")),
          `findings/${basename(path)}`,
        ),
      });
    } catch (error) {
      failures++;
      console.error(`${basename(path)}: INVALID ${String(error)}`);
    }
  }
  const local = new Set(valid.map((v) => v.file.slug));
  const missing = [
    ...new Set(
      valid
        .flatMap((v) => v.file.relations.map((r) => r.slug))
        .filter((slug) => !local.has(slug)),
    ),
  ];
  const known = new Set(
    missing.length
      ? (
          await prisma.researchFinding.findMany({
            where: { slug: { in: missing } },
            select: { slug: true },
          })
        ).map((f) => f.slug)
      : [],
  );
  for (const { path, file } of valid) {
    const unresolved = file.relations.filter(
      (r) => !local.has(r.slug) && !known.has(r.slug),
    );
    if (unresolved.length) {
      failures++;
      console.error(
        `${basename(path)}: missing relation targets: ${unresolved.map((r) => r.slug).join(", ")}`,
      );
    } else console.log(`${basename(path)}: VALID`);
  }
  if (!valid.length && !failures)
    throw new Error("No JSON finding files found");
  if (failures) process.exitCode = 1;
}
async function ingest(target: string) {
  await assertEmbeddingDimensions(ragConfig().EMBEDDING_DIMS);
  if (target.startsWith("gs://")) {
    const match = /^gs:\/\/([^/]+)\/findings\/?$/.exec(target);
    if (!match) throw new Error("Expected gs://bucket/findings/");
    const bucket = match[1]!;
    const storage = corpusStorage(bucket);
    for (const file of await storage.list())
      await run(
        {
          bucketId: bucket,
          objectId: file.key,
          objectGeneration: file.generation,
          eventType: "CLI",
        },
        { storage },
      );
  } else {
    // Local imports use real generation metadata when a bucket is configured; otherwise each edit gets a monotonic generation.
    const bucket = process.env.GCS_RESEARCH_CORPUS_BUCKET;
    const remote = bucket ? corpusStorage(bucket) : undefined;
    const storage: CorpusStorage = remote ?? {
      currentGeneration: async () => null,
      download: async () => {
        throw new Error("Local import has no remote object");
      },
      report: async () => {},
      list: async () => [],
    };
    for (const file of await localFiles(target)) {
      const key = `findings/${basename(file)}`;
      if (remote && (await remote.currentGeneration(key)))
        throw new Error(
          `${key} already exists in GCS; upload changes there or ingest its gs:// path to preserve generation ordering`,
        );
      const existing = await prisma.researchFinding.findUnique({
        where: { gcsObjectKey: key },
        select: { gcsGeneration: true },
      });
      const generation = (
        BigInt(existing?.gcsGeneration ?? "0") + 1n
      ).toString();
      await run(
        {
          bucketId: bucket ?? "local",
          objectId: key,
          objectGeneration: generation,
          eventType: "CLI",
        },
        { storage, localText: await readFile(file, "utf8") },
      );
    }
  }
}
async function run(
  event: CorpusEvent,
  options: Parameters<typeof ingestFinding>[1],
) {
  const result = await ingestFinding(event, options);
  console.log(`${event.objectId}: ${JSON.stringify(result)}`);
  if (result.outcome === "FAILED" || result.outcome === "INVALID")
    process.exitCode = 1;
}
async function reembed(args: string[]) {
  await assertEmbeddingDimensions(ragConfig().EMBEDDING_DIMS);
  const slug = args[0] === "--slug" ? args[1] : undefined;
  if (args[0] !== "--all" && !slug)
    throw new Error("Use --all or --slug <slug>");
  const bucket = process.env.GCS_RESEARCH_CORPUS_BUCKET;
  if (!bucket)
    throw new Error("GCS_RESEARCH_CORPUS_BUCKET is required for reembedding");
  let cursor: string | undefined;
  do {
    const rows = await prisma.researchFinding.findMany({
      where: {
        status: { not: "RETIRED" },
        gcsObjectKey: { startsWith: "findings/" },
        ...(slug ? { slug } : {}),
      },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, gcsObjectKey: true, gcsGeneration: true },
    });
    for (const row of rows)
      await run(
        {
          bucketId: bucket,
          objectId: row.gcsObjectKey,
          objectGeneration: row.gcsGeneration,
          eventType: "CLI",
        },
        { forceReembed: true },
      );
    cursor = rows.length === 100 ? rows.at(-1)!.id : undefined;
  } while (cursor);
}
async function reconcile(fix: boolean) {
  const bucket = process.env.GCS_RESEARCH_CORPUS_BUCKET;
  if (!bucket)
    throw new Error(
      "GCS_RESEARCH_CORPUS_BUCKET is required for reconciliation",
    );
  const files = await corpusStorage(bucket).list();
  const rows = await prisma.researchFinding.findMany({
    where: { gcsObjectKey: { startsWith: "findings/" } },
    select: { id: true, gcsObjectKey: true, gcsGeneration: true, status: true },
  });
  const objects = new Map(files.map((f) => [f.key, f.generation]));
  const byKey = new Map(rows.map((r) => [r.gcsObjectKey, r]));
  const events: CorpusEvent[] = [];
  for (const file of files) {
    const row = byKey.get(file.key);
    if (!row || row.gcsGeneration !== file.generation)
      events.push({
        bucketId: bucket,
        objectId: file.key,
        objectGeneration: file.generation,
        eventType: "OBJECT_FINALIZE",
      });
  }
  for (const row of rows)
    if (row.status === "VERIFIED" && !objects.has(row.gcsObjectKey))
      events.push({
        bucketId: bucket,
        objectId: row.gcsObjectKey,
        objectGeneration: row.gcsGeneration,
        eventType: "OBJECT_DELETE",
      });
  const pending = await prisma.pendingFindingRelation.findMany({
    select: { sourceFindingId: true, targetSlug: true },
  });
  for (const relation of pending) {
    const source = rows.find((r) => r.id === relation.sourceFindingId);
    if (
      source &&
      objects.has(`findings/${relation.targetSlug}.json`) &&
      objects.has(source.gcsObjectKey)
    ) {
      const event: CorpusEvent = {
        bucketId: bucket,
        objectId: source.gcsObjectKey,
        objectGeneration: objects.get(source.gcsObjectKey)!,
        eventType: "CLI",
      };
      if (!events.some((e) => corpusJobId(e) === corpusJobId(event)))
        events.push(event);
    }
  }
  console.log(
    JSON.stringify(
      { discrepancies: events, unresolvedRelations: pending },
      null,
      2,
    ),
  );
  if (!fix) return;
  const connection = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null },
  );
  const queue = new Queue<CorpusEvent>(QUEUES.CORPUS_INGEST, { connection });
  try {
    for (const event of events) {
      const id = corpusJobId(event);
      const previous = await queue.getJob(id);
      const state = await previous?.getState();
      if (state === "completed" || state === "failed") await previous!.remove();
      await queue.add("ingest", event, {
        jobId: id,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      });
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}
const [command, ...args] = process.argv.slice(2);
try {
  if (command === "validate" && args[0]) await validate(args[0]);
  else if (command === "ingest" && args[0]) await ingest(args[0]);
  else if (command === "reembed") await reembed(args);
  else if (command === "reconcile") await reconcile(args.includes("--fix"));
  else
    throw new Error(
      "Usage: cli.ts validate <dir> | ingest <dir|gs://bucket/findings/> | reembed --all|--slug <slug> | reconcile [--fix]",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Corpus command failed",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
