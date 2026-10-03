import { it, expect } from "vitest";
import { unsafeDrops } from "./check-migrations.mjs";
it("rejects protected index and trigger drops", () => {
  expect(
    unsafeDrops(
      'DROP INDEX IF EXISTS public."finding_chunks_embedding_hnsw_idx";',
    ),
  ).toHaveLength(1);
  expect(
    unsafeDrops(
      'DROP TRIGGER "research_findings_search_vector_trg" ON research_findings;',
    ),
  ).toHaveLength(1);
  expect(
    unsafeDrops("DROP INDEX unrelated, research_findings_search_vector_idx;"),
  ).toHaveLength(1);
});
it("allows creation and ignores comments", () => {
  expect(
    unsafeDrops(
      "-- DROP INDEX finding_chunks_embedding_hnsw_idx;\nCREATE INDEX finding_chunks_embedding_hnsw_idx ON finding_chunks USING hnsw (embedding vector_cosine_ops);",
    ),
  ).toEqual([]);
});

it("protects the cache vector index and extension", () => {
  expect(
    unsafeDrops("DROP INDEX retrieval_cache_embedding_hnsw_idx;"),
  ).toHaveLength(1);
  expect(unsafeDrops("DROP EXTENSION IF EXISTS vector CASCADE;")).toHaveLength(
    1,
  );
});
