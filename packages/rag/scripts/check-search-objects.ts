import assert from "node:assert/strict";
import { prisma } from "@useframe/db";
try {
  const extensions = await prisma.$queryRaw<
    Array<{ extname: string }>
  >`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
  assert.equal(extensions.length, 1, "pgvector extension missing");
  const indexes = await prisma.$queryRaw<
    Array<{ indexname: string; indexdef: string }>
  >`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()`;
  for (const name of [
    "finding_chunks_embedding_hnsw_idx",
    "retrieval_cache_embedding_hnsw_idx",
  ])
    assert(
      indexes.some(
        (i) =>
          i.indexname === name &&
          i.indexdef.includes("USING hnsw") &&
          i.indexdef.includes("vector_cosine_ops"),
      ),
      `${name} missing or changed`,
    );
  assert(
    indexes.some(
      (i) =>
        i.indexname === "research_findings_search_vector_idx" &&
        i.indexdef.includes("USING gin"),
    ),
    "Corpus search index missing",
  );
  const triggers = await prisma.$queryRaw<
    Array<{ tgname: string }>
  >`SELECT tgname FROM pg_trigger WHERE tgrelid = 'research_findings'::regclass AND NOT tgisinternal`;
  assert(
    triggers.some((t) => t.tgname === "research_findings_search_vector_trg"),
    "Corpus search trigger missing",
  );
  assert(
    await prisma.corpusVersion.findUnique({ where: { id: 1 } }),
    "Corpus version singleton missing",
  );
  console.log("Corpus and cache search objects preserved");
} finally {
  await prisma.$disconnect();
}
