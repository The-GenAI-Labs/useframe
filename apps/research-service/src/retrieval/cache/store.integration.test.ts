import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { Prisma } from "@useframe/db";
const context = vi.hoisted(() => ({
  tx: undefined as Prisma.TransactionClient | undefined,
  redis: new Map<string, string>(),
}));
vi.mock("../../lib/redis.js", () => ({
  getRedis: async () => ({
    get: async (key: string) => context.redis.get(key) ?? null,
    set: async (key: string, value: string) => context.redis.set(key, value),
  }),
}));
vi.mock("@useframe/db", async (original) => {
  const actual = await original<typeof import("@useframe/db")>();
  return {
    ...actual,
    prisma: new Proxy(actual.prisma, {
      get(target, key) {
        if (key === "$transaction" && context.tx)
          return async (
            callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          ) => callback(context.tx!);
        const source = context.tx ?? target;
        const value = Reflect.get(source, key);
        return typeof value === "function" ? value.bind(source) : value;
      },
    }),
  };
});
import { prisma } from "@useframe/db";
import { cacheStore } from "./store.js";
import type { Metadata } from "./cache.js";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite("cache PostgreSQL integration (fixture writes roll back)", () => {
  let release!: () => void, transaction: Promise<unknown>;
  const rollback = new Error("rollback");
  const vector = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
  let meta: Metadata;
  beforeAll(async () => {
    const actual =
      await vi.importActual<typeof import("@useframe/db")>("@useframe/db");
    let ready!: () => void;
    const started = new Promise<void>((r) => (ready = r));
    const stopped = new Promise<void>((r) => (release = r));
    transaction = actual.prisma
      .$transaction(
        async (tx) => {
          context.tx = tx;
          ready();
          await stopped;
          throw rollback;
        },
        { timeout: 120000, maxWait: 15000 },
      )
      .catch((e) => {
        if (e !== rollback) throw e;
      });
    await Promise.race([started, transaction]);
    meta = {
      area: "COLOR",
      niche: "SAAS_B2B",
      version: await cacheStore.version(),
      model: `cache-fixture-${Date.now()}`,
      fingerprint: "fixture",
    };
  }, 30000);
  afterAll(async () => {
    release?.();
    await transaction;
    context.tx = undefined;
    const actual =
      await vi.importActual<typeof import("@useframe/db")>("@useframe/db");
    await actual.prisma.$disconnect();
  }, 30000);
  it("has a vector(1024), cosine HNSW index and singleton version row", async () => {
    const indexes = await prisma.$queryRaw<
      Array<{ indexdef: string }>
    >`SELECT indexdef FROM pg_indexes WHERE indexname = 'retrieval_cache_embedding_hnsw_idx'`;
    expect(indexes[0]?.indexdef).toContain("USING hnsw");
    expect(indexes[0]?.indexdef).toContain("vector_cosine_ops");
    const types = await prisma.$queryRaw<
      Array<{ type: string }>
    >`SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='retrieval_cache_entries'::regclass AND attname='embedding'`;
    expect(types[0]?.type).toBe("vector(1024)");
    expect(await prisma.corpusVersion.count()).toBe(1);
  });
  it("inserts once, deduplicates, and writes Redis using the same version", async () => {
    expect(await cacheStore.write(meta, "Original", vector, [], 0.99)).toBe(
      true,
    );
    await cacheStore.backfill(`fixture:${meta.version}`, [], 30);
    expect(await cacheStore.exact(`fixture:${meta.version}`)).toBe("[]");
    expect(await cacheStore.write(meta, "Equivalent", vector, [], 0.99)).toBe(
      true,
    );
    const rows = await prisma.retrievalCacheEntry.findMany({
      where: { embeddingModel: meta.model },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hitCount).toBe(1);
    expect(rows[0]?.lastHitAt).not.toBeNull();
  });
  it("filters wrong area, niche, model, configuration and version before nearest ranking", async () => {
    expect(
      await cacheStore.nearest({ ...meta, niche: "ECOMMERCE" }, vector, 3),
    ).toEqual([]);
    expect(
      await cacheStore.nearest({ ...meta, area: "LAYOUT" }, vector, 3),
    ).toEqual([]);
    expect(
      await cacheStore.nearest({ ...meta, model: "other" }, vector, 3),
    ).toEqual([]);
    expect(
      await cacheStore.nearest({ ...meta, fingerprint: "changed" }, vector, 3),
    ).toEqual([]);
    expect(
      await cacheStore.nearest(
        { ...meta, version: meta.version + 1 },
        vector,
        3,
      ),
    ).toEqual([]);
    expect(await cacheStore.nearest(meta, vector, 3)).toHaveLength(1);
  });
  it("invalidates byte-identical passages after a committed-version change and rejects stale writes", async () => {
    await prisma.corpusVersion.update({
      where: { id: 1 },
      data: { version: { increment: 1 } },
    });
    const next = { ...meta, version: await cacheStore.version() };
    expect(next.version).toBe(meta.version + 1);
    expect(await cacheStore.nearest(next, vector, 3)).toEqual([]);
    expect(await cacheStore.write(meta, "stale", vector, [], 0.99)).toBe(false);
  });
});
