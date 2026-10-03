import { describe, it, expect } from "vitest";
import { DecisionArea } from "@useframe/db";
import { DECISION_AREAS } from "./contract.js";
import { chunkStatement } from "./chunker.js";
import {
  parseFindingFile,
  FindingFileSchema,
  findingHashes,
  embeddingText,
  type FindingFile,
} from "./findingFile.js";
import { buildTsQuery, fuseRanks } from "./search.js";
import { CorpusEventSchema, corpusJobId } from "./ingestion.js";
const words = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => `word${i + offset}`).join(" ");
const fixture: FindingFile = {
  slug: "test-finding",
  status: "VERIFIED",
  category: "LAYOUT",
  title: "Target size",
  statement: "Exact original statement.",
  tags: ["touch", "mobile"],
  source: { title: "A real source", doi: "10.1234/example" },
  relations: [],
};
describe("chunking", () => {
  it("splits a long sentence into 150-word windows", () => {
    expect(chunkStatement(words(450)).map((c) => c.wordCount)).toEqual([
      150, 150, 150, 75,
    ]);
  });
  it.each([1, 150, 200])("keeps %s words intact", (n) => {
    const text = `  ${words(n)}\n`;
    expect(chunkStatement(text)).toEqual([
      { chunkIndex: 0, chunkText: text, wordCount: n },
    ]);
  });
  it("splits 450 words across sentence boundaries with overlap", () => {
    const text = Array.from(
      { length: 9 },
      (_, i) => `${words(50, i * 50)}.`,
    ).join("\n");
    const chunks = chunkStatement(text);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.wordCount)).toEqual([150, 175, 175]);
    expect(chunks).toEqual(chunkStatement(text));
  });
  it.each([201, 310, 450, 800])("reconstructs a %s-word long sentence", (n) => {
    const text = words(n);
    const chunks = chunkStatement(text);
    const restored: string[] = [];
    for (const chunk of chunks) {
      expect(text).toContain(chunk.chunkText);
      const current = chunk.chunkText.split(/\s+/);
      const first = Number(current[0]!.slice(4));
      const overlap = restored.length - first;
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(overlap).toBeLessThanOrEqual(30);
      restored.push(...current.slice(overlap));
      expect(chunk.wordCount).toBe(current.length);
    }
    expect(restored.join(" ")).toBe(text);
  });
  it("merges a tiny final remainder", () =>
    expect(chunkStatement(words(280))).toHaveLength(2));
});
describe("file validation and embeddings", () => {
  it("requires a source for VERIFIED, rejects unknown fields and wrong filenames", () => {
    expect(
      FindingFileSchema.safeParse({ ...fixture, source: undefined }).success,
    ).toBe(false);
    expect(
      FindingFileSchema.safeParse({ ...fixture, extra: true }).success,
    ).toBe(false);
    expect(() => parseFindingFile(fixture, "findings/wrong.json")).toThrow(
      "filename",
    );
    expect(
      FindingFileSchema.safeParse({
        ...fixture,
        status: "DRAFT",
        source: undefined,
      }).success,
    ).toBe(true);
    expect(
      FindingFileSchema.safeParse({
        ...fixture,
        relations: [{ slug: fixture.slug, type: "SUPPORTS" }],
      }).success,
    ).toBe(false);
  });
  it("only invalidates embeddings for embedded text or model changes", () => {
    const base = findingHashes(fixture, "voyage-4", 1024);
    const metadata = findingHashes(
      {
        ...fixture,
        sourceLocator: "p. 2",
        source: { ...fixture.source!, year: 2020 },
      },
      "voyage-4",
      1024,
    );
    expect(metadata.contentHash).not.toBe(base.contentHash);
    expect(metadata.embeddingHash).toBe(base.embeddingHash);
    expect(
      findingHashes(
        { ...fixture, tags: [...fixture.tags].reverse() },
        "voyage-4",
        1024,
      ).embeddingHash,
    ).toBe(base.embeddingHash);
    expect(findingHashes(fixture, "next-model", 1024).embeddingHash).not.toBe(
      base.embeddingHash,
    );
    expect(embeddingText(fixture, fixture.statement)).toBe(
      "Target size.\nExact original statement.\nTags: mobile, touch",
    );
  });
});
it("matches the Prisma decision-area enum", () =>
  expect(DECISION_AREAS).toEqual(Object.values(DecisionArea)));
it("sanitizes full-text queries and fuses ranks by identity", () => {
  expect(
    buildTsQuery(["touch target", "contrast", "'); DROP TABLE x; --"]),
  ).toBe("(touch & target) | contrast | (drop & table & x)");
  const result = fuseRanks([
    [
      { id: "a", score: 1 },
      { id: "b", score: 0.5 },
    ],
    [{ id: "b", score: 1 }],
  ]);
  expect(result[0]!.id).toBe("b");
  expect(result[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
});
it("deduplicates event IDs and excludes reports and nested paths", () => {
  const event = {
    bucketId: "bucket",
    objectId: "findings/test-finding.json",
    objectGeneration: "123",
    eventType: "OBJECT_FINALIZE" as const,
  };
  expect(corpusJobId(event)).toBe(
    "findings/test-finding.json#123#OBJECT_FINALIZE",
  );
  expect(
    CorpusEventSchema.safeParse({
      ...event,
      objectId: "_reports/findings/test-finding.result.json",
    }).success,
  ).toBe(false);
  expect(
    CorpusEventSchema.safeParse({
      ...event,
      objectId: "findings/sub/test.json",
    }).success,
  ).toBe(false);
});

it("treats an exact-generation download removed during overwrite as stale", async () => {
  const { ingestFinding } = await import("./ingestion.js");
  const { prisma } = await import("@useframe/db");
  let metadataReads = 0;
  const logs: unknown[] = [];
  const db = {
    corpusIngestionLog: {
      create: async (data: unknown) => {
        logs.push(data);
      },
    },
  } as unknown as typeof prisma;
  const result = await ingestFinding(
    {
      bucketId: "fixture",
      objectId: "findings/test-finding.json",
      objectGeneration: "1",
      eventType: "OBJECT_FINALIZE",
    },
    {
      db,
      storage: {
        currentGeneration: async () => (++metadataReads === 1 ? "1" : "2"),
        download: async () => {
          throw Object.assign(new Error("Not found"), { code: 404 });
        },
        report: async () => {},
        list: async () => [],
      },
      embedder: {
        model: "fixture",
        dims: 1024,
        embedDocuments: async () => {
          throw new Error("Must not embed stale objects");
        },
        embedQuery: async () => [],
      },
    },
  );
  expect(result.outcome).toBe("SKIPPED_STALE_GENERATION");
  expect(logs).toHaveLength(1);
});
