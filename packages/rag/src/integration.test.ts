import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { Prisma, prisma as PrismaInstance } from "@useframe/db";
const context = vi.hoisted(() => ({
  tx: undefined as Prisma.TransactionClient | undefined,
}));
vi.mock("@useframe/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@useframe/db")>();
  const proxy = new Proxy(actual.prisma, {
    get(target, key) {
      if (key === "$transaction" && context.tx)
        return async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) => callback(context.tx!);
      const source = context.tx ?? target;
      const value = Reflect.get(source, key);
      return typeof value === "function" ? value.bind(source) : value;
    },
  });
  return { ...actual, prisma: proxy };
});
import { prisma } from "@useframe/db";
import { ingestFinding } from "./ingestion.js";
import { ProviderError } from "./http.js";
import { denseSearch, sparseSearch } from "./search.js";
import { createRetriever } from "./retrieval.js";
import { RagEnvSchema } from "./config.js";
import { DECISION_AREAS } from "./contract.js";
import { saveCitations, getProjectResearch } from "./citations.js";
import type { FindingFile } from "./findingFile.js";
import type { CorpusStorage } from "./storage.js";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite("PostgreSQL corpus integration (all fixture writes rolled back)", () => {
  let release: () => void;
  let transaction: Promise<unknown>;
  const rollback = new Error("fixture rollback");
  const prefix = `fixture-${Date.now()}`;
  let serial = 0;
  const vector = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
  const embedder = {
    model: "fixture-model",
    dims: 1024,
    embedDocuments: vi.fn(async (texts: string[]) => texts.map(() => vector)),
    embedQuery: vi.fn(async () => vector),
  };
  const storage: CorpusStorage = {
    currentGeneration: async () => "1",
    download: async () => "",
    report: vi.fn(async () => {}),
    list: async () => [],
  };
  const makeFile = (patch: Partial<FindingFile> = {}): FindingFile => ({
    slug: `${prefix}-${++serial}`,
    title: "Mobile touch target accessibility",
    statement:
      "Generous touch targets improve mobile accessibility and contrast.",
    category: "LAYOUT",
    status: "VERIFIED",
    tags: ["mobile", "touch"],
    source: { title: "Fixture source (test only)", doi: `fixture:${prefix}` },
    relations: [],
    ...patch,
  });
  async function ingest(
    file: FindingFile,
    generation = "1",
    extra: Parameters<typeof ingestFinding>[1] = {},
  ) {
    return ingestFinding(
      {
        bucketId: "fixture",
        objectId: `findings/${file.slug}.json`,
        objectGeneration: generation,
        eventType: "OBJECT_FINALIZE",
      },
      {
        db: prisma,
        embedder,
        storage,
        localText: JSON.stringify(file),
        ...extra,
      },
    );
  }
  beforeAll(async () => {
    const actual =
      await vi.importActual<typeof import("@useframe/db")>("@useframe/db");
    let ready: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const stopped = new Promise<void>((resolve) => {
      release = resolve;
    });
    transaction = actual.prisma
      .$transaction(
        async (tx) => {
          context.tx = tx;
          ready();
          await stopped;
          throw rollback;
        },
        { timeout: 300000, maxWait: 15000 },
      )
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    await Promise.race([started, transaction]);
  }, 30000);
  afterAll(async () => {
    release?.();
    await transaction;
    context.tx = undefined;
    const actual =
      await vi.importActual<typeof import("@useframe/db")>("@useframe/db");
    await actual.prisma.$disconnect();
  }, 30000);
  it("increments corpus version only for successful changes and retirements", async () => {
    const version = async () =>
      (await prisma.corpusVersion.findUniqueOrThrow({ where: { id: 1 } }))
        .version;
    const before = await version();
    const file = makeFile();
    expect((await ingest(file)).outcome).toBe("SUCCESS");
    expect(await version()).toBe(before + 1);
    expect((await ingest(file)).outcome).toBe("SKIPPED_UNCHANGED");
    expect(await version()).toBe(before + 1);
    expect((await ingest(file, "2", { localText: "invalid" })).outcome).toBe(
      "INVALID",
    );
    expect(await version()).toBe(before + 1);
    expect(
      (
        await ingest({ ...file, statement: "changed" }, "2", {
          embedder: {
            ...embedder,
            embedDocuments: async () => {
              throw new ProviderError("invalid", false);
            },
          },
        })
      ).outcome,
    ).toBe("FAILED");
    expect(await version()).toBe(before + 1);
    expect(
      (await ingest({ ...file, relations: [], title: "Changed title" }, "2"))
        .outcome,
    ).toBe("SUCCESS");
    expect(await version()).toBe(before + 2);
    await ingestFinding(
      {
        bucketId: "fixture",
        objectId: `findings/${file.slug}.json`,
        objectGeneration: "2",
        eventType: "OBJECT_DELETE",
      },
      {
        db: prisma,
        embedder,
        storage: { ...storage, currentGeneration: async () => null },
      },
    );
    expect(await version()).toBe(before + 3);
  }, 60000);
  it("ingests exact text, skips duplicates and metadata-only embeddings, rejects invalid updates", async () => {
    const file = makeFile();
    const before = embedder.embedDocuments.mock.calls.length;
    const first = await ingest(file);
    expect(first.outcome).toBe("SUCCESS");
    expect((await ingest(file)).outcome).toBe("SKIPPED_UNCHANGED");
    expect(
      (await ingest({ ...file, sourceLocator: "p. 2" }, "2")).outcome,
    ).toBe("SUCCESS");
    expect(embedder.embedDocuments.mock.calls.length - before).toBe(1);
    const row = await prisma.researchFinding.findUniqueOrThrow({
      where: { slug: file.slug },
    });
    expect(row.statement).toBe(file.statement);
    expect((await ingest(file, "3", { localText: "{invalid" })).outcome).toBe(
      "INVALID",
    );
    expect(
      (
        await prisma.researchFinding.findUniqueOrThrow({
          where: { slug: file.slug },
        })
      ).gcsGeneration,
    ).toBe("2");
    expect(
      (
        await ingest(
          { ...file, statement: `${file.statement} More exact words.` },
          "4",
        )
      ).outcome,
    ).toBe("SUCCESS");
    expect(embedder.embedDocuments.mock.calls.length - before).toBe(2);
    expect((await ingest(file, "1")).outcome).toBe("SKIPPED_STALE_GENERATION");
  }, 60000);
  it("ignores overwrite deletes, retires real deletes, and prevents late resurrection", async () => {
    const file = makeFile();
    await ingest(file);
    const event = {
      bucketId: "fixture",
      objectId: `findings/${file.slug}.json`,
      objectGeneration: "1",
      eventType: "OBJECT_DELETE" as const,
    };
    expect(
      (
        await ingestFinding(
          { ...event, overwrittenByGeneration: "2" },
          { db: prisma, storage, embedder },
        )
      ).outcome,
    ).toBe("SKIPPED_OVERWRITTEN");
    expect(
      (
        await ingestFinding(event, {
          db: prisma,
          storage: { ...storage, currentGeneration: async () => null },
          embedder,
        })
      ).outcome,
    ).toBe("RETIRED");
    expect((await ingest(file)).outcome).toBe("SKIPPED_STALE_GENERATION");
    const row = await prisma.researchFinding.findUniqueOrThrow({
      where: { slug: file.slug },
      include: { chunks: true },
    });
    expect(row.status).toBe("RETIRED");
    expect(row.chunks).toHaveLength(0);
    const missing = makeFile();
    await ingestFinding(
      { ...event, objectId: `findings/${missing.slug}.json` },
      { db: prisma, storage, embedder },
    );
    expect((await ingest(missing)).outcome).toBe("SKIPPED_STALE_GENERATION");
  }, 60000);
  it("resolves relations in either upload order and replaces declarations", async () => {
    const target = makeFile();
    const source = makeFile({
      relations: [{ slug: target.slug, type: "SUPPORTS" }],
    });
    const from = await ingest(source);
    expect(
      await prisma.pendingFindingRelation.count({
        where: { sourceFindingId: from.findingId },
      }),
    ).toBe(1);
    const to = await ingest(target);
    expect(
      await prisma.pendingFindingRelation.count({
        where: { sourceFindingId: from.findingId },
      }),
    ).toBe(0);
    expect(
      await prisma.findingRelation.count({
        where: { findingId: from.findingId, relatedFindingId: to.findingId },
      }),
    ).toBe(1);
    const reverse = await ingest(
      makeFile({ relations: [{ slug: source.slug, type: "REFINES" }] }),
    );
    expect(
      await prisma.findingRelation.count({
        where: {
          findingId: reverse.findingId,
          relatedFindingId: from.findingId,
        },
      }),
    ).toBe(1);
    await ingest({ ...source, relations: [] }, "2");
    expect(
      await prisma.findingRelation.count({
        where: { findingId: from.findingId },
      }),
    ).toBe(0);
  }, 60000);
  it("retries transient failures and records a final failure without altering the live row", async () => {
    const file = makeFile();
    const failing = {
      ...embedder,
      embedDocuments: async () => {
        throw new ProviderError("provider unavailable", true);
      },
    };
    await expect(
      ingest(file, "1", { embedder: failing, finalAttempt: false }),
    ).rejects.toThrow("provider unavailable");
    expect(
      (await ingest(file, "1", { embedder: failing, finalAttempt: true }))
        .outcome,
    ).toBe("FAILED");
    expect(
      await prisma.researchFinding.findUnique({ where: { slug: file.slug } }),
    ).toBeNull();
    expect(
      await prisma.corpusIngestionLog.count({
        where: { objectKey: `findings/${file.slug}.json`, outcome: "FAILED" },
      }),
    ).toBe(1);
  }, 30000);
  it("filters draft/retired/model-mismatched vectors and maintains full-text search", async () => {
    const good = await ingest(makeFile());
    const draft = await ingest(makeFile({ status: "DRAFT" }));
    const old = await ingest(makeFile(), "1", {
      embedder: { ...embedder, model: "older-model" },
    });
    const dense = await denseSearch(vector, embedder.model, 80);
    expect(dense.some((r) => r.id === good.findingId)).toBe(true);
    expect(
      dense.some((r) => r.id === draft.findingId || r.id === old.findingId),
    ).toBe(false);
    const sparse = await sparseSearch("touch & accessibility", 80);
    expect(sparse.some((r) => r.id === good.findingId)).toBe(true);
    expect(sparse.some((r) => r.id === draft.findingId)).toBe(false);
  }, 30000);
  it("handles provider fallbacks, applies=false, relation caps and tensions", async () => {
    const targets = await Promise.all(
      [makeFile(), makeFile(), makeFile()].map(async (file) => ({
        file,
        result: await ingest(file),
      })),
    );
    const seed = await ingest(
      makeFile({
        relations: targets.map((t) => ({
          slug: t.file.slug,
          type: "SUPPORTS" as const,
        })),
      }),
    );
    await prisma.findingRelation.create({
      data: {
        findingId: seed.findingId!,
        relatedFindingId: targets[0]!.result.findingId!,
        relationType: "CONFLICTS",
        note: "Fixture tension",
      },
    });
    const deps = {
      db: prisma,
      config: RagEnvSchema.parse({}),
      embedder,
      hyde: async () => ({
        areas: DECISION_AREAS.map((area) => ({
          area,
          applies: area !== "MOTION",
          passage: "Mobile accessibility",
          keywords: ["mobile"],
        })),
      }),
      dense: async () => [{ id: seed.findingId!, score: 1 }],
      sparse: async () => [{ id: seed.findingId!, score: 1 }],
      rerank: async () => {
        throw new Error("unavailable");
      },
    };
    const input = {
      projectId: "fixture",
      rawIdea: "Accessible mobile store",
      niche: "ECOMMERCE" as const,
      intakeAnswers: {},
    };
    const result = await createRetriever(deps)(input);
    expect(
      result.areas.find((a) => a.area === "MOTION")!.findings,
    ).toHaveLength(0);
    expect(result.areas[0]!.findings.filter((f) => f.viaRelation)).toHaveLength(
      2,
    );
    expect(result.areas[0]!.findings[0]!.rerankScore).toBeNull();
    expect(result.tensions).toHaveLength(1);
    const fallback = await createRetriever({
      ...deps,
      embedder: {
        ...embedder,
        embedQuery: async () => {
          throw new Error("unavailable");
        },
      },
    })(input);
    expect(fallback.areas[0]!.findings[0]!.findingId).toBe(seed.findingId);
    const empty = await createRetriever({
      ...deps,
      rerank: async () => [{ index: 0, relevance_score: 0.01 }],
    })(input);
    expect(empty.areas.every((a) => !a.findings.length)).toBe(true);
  }, 60000);
  it("recomputes distinct report reuse, replaces citations and reads ordered retired sources", async () => {
    const one = await ingest(makeFile());
    const two = await ingest(makeFile());
    const user = await prisma.user.create({ data: {} });
    async function report() {
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          slug: `${prefix}-project-${++serial}`,
          name: "Fixture",
          startupIdea: "Fixture",
          targetAudience: "Fixture",
        },
      });
      const report = await prisma.researchReport.create({
        data: {
          projectId: project.id,
          summary: "Fixture",
          primaryColor: "",
          secondaryColor: "",
          accentColor: "",
          colorPalette: [],
          colorRationale: "",
          fontPrimary: "",
          fontSecondary: "",
          typographyRationale: "",
          layoutStyle: "",
          layoutRationale: "",
          imageStyle: "",
          imageDirection: {},
          imageRationale: "",
          citations: [],
          styleTagKeys: [],
        },
      });
      return { project, report };
    }
    const a = await report();
    const b = await report();
    const citation = {
      findingId: one.findingId!,
      decisionArea: "LAYOUT" as const,
      rank: 1,
      rrfScore: 0.1,
      rerankScore: null,
      viaRelation: false,
      reasoning: "Supports mobile use",
    };
    await saveCitations(a.report.id, [
      citation,
      { ...citation, decisionArea: "COLOR" },
    ]);
    await saveCitations(b.report.id, [citation]);
    expect(
      (
        await prisma.researchFinding.findUniqueOrThrow({
          where: { id: one.findingId },
        })
      ).reuseCount,
    ).toBe(2);
    await saveCitations(a.report.id, [
      { ...citation, findingId: two.findingId!, decisionArea: "COLOR" },
    ]);
    expect(
      (
        await prisma.researchFinding.findUniqueOrThrow({
          where: { id: one.findingId },
        })
      ).reuseCount,
    ).toBe(1);
    await prisma.researchFinding.update({
      where: { id: two.findingId },
      data: { status: "RETIRED" },
    });
    const view = await getProjectResearch(a.project.id);
    expect(view!.areas.map((a) => a.area)).toEqual(["COLOR"]);
    expect(view!.areas[0]!.findings[0]!.retired).toBe(true);
    expect(view!.areas[0]!.findings[0]!.source?.title).toBe(
      "Fixture source (test only)",
    );
    await saveCitations(b.report.id, []);
    expect(
      (
        await prisma.researchFinding.findUniqueOrThrow({
          where: { id: one.findingId },
        })
      ).reuseCount,
    ).toBe(0);
  }, 60000);
});
