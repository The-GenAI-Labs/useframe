import { afterEach, describe, it, expect, vi } from "vitest";
import { prefetchedEmbedder, voyageProvider } from "./embeddings.js";
import { RagEnvSchema } from "./config.js";
import { backoffMs, requestJson, retryAfterMs } from "./http.js";
import { isTransient } from "./ingestion.js";
vi.mock("../../../apps/worker/src/config/env.js", () => ({ env: {} }));
vi.mock("../../../apps/worker/src/lib/redis.js", () => ({ redis: {} }));
import { handleCorpusMessage } from "../../../apps/worker/src/processors/corpus.processor.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Voyage boundary", () => {
  it("batches documents, uses query input type, and verifies dimensions", async () => {
    const calls: Array<{
      input: string[];
      input_type: string;
      model: string;
      output_dimension: number;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        calls.push(body);
        return new Response(
          JSON.stringify({
            data: body.input.map((_: string, index: number) => ({
              index,
              embedding: [1, 0],
            })),
          }),
        );
      }),
    );
    const provider = voyageProvider(
      RagEnvSchema.parse({ VOYAGE_API_KEY: "fixture", EMBEDDING_DIMS: 2 }),
    );
    expect(
      await provider.embedDocuments(
        Array.from({ length: 1001 }, () => "words"),
      ),
    ).toHaveLength(1001);
    await provider.embedQuery("query");
    await provider.embedQueries(["a", "b", "c"]);
    expect(calls.map((c) => c.input.length)).toEqual([1000, 1, 1, 3]);
    expect(calls.map((c) => c.input_type)).toEqual([
      "document",
      "document",
      "query",
      "query",
    ]);
    expect(calls.every((c) => c.output_dimension === 2)).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [{ index: 0, embedding: [1] }] }),
          ),
      ),
    );
    await expect(provider.embedQuery("query")).rejects.toThrow();
  });
  it("retries 429 with bounded backoff and never retries 401", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    const result = requestJson("https://fixture.invalid", {});
    const assertion = expect(result).resolves.toEqual({ ok: true });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockResolvedValue(new Response("", { status: 401 }));
    await expect(requestJson("https://fixture.invalid", {})).rejects.toThrow(
      "401",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("waits for Retry-After on 429 and gives up after six attempts", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "20" } }),
      )
      .mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    const result = requestJson("https://fixture.invalid", {});
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toEqual({ ok: true });
    fetcher.mockReset().mockResolvedValue(new Response("", { status: 503 }));
    const failing = requestJson("https://fixture.invalid", {});
    const assertion = expect(failing).rejects.toThrow("503");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("caps backoff at 60 s with jitter and parses Retry-After dates", () => {
    expect(backoffMs(0, 0)).toBe(500);
    expect(backoffMs(0, 1)).toBe(1000);
    expect(backoffMs(10, 0)).toBe(30_000);
    expect(backoffMs(10, 1)).toBe(60_000);
    const now = Date.parse("2026-11-13T00:00:00Z");
    expect(retryAfterMs("Fri, 13 Nov 2026 00:00:05 GMT", now)).toBe(5000);
    expect(retryAfterMs("600", now)).toBe(60_000);
    expect(retryAfterMs(null, now)).toBeUndefined();
    expect(retryAfterMs("soon", now)).toBeUndefined();
  });
  it("serves prefetched vectors and falls back for unknown texts", async () => {
    const base = {
      model: "fixture",
      dims: 1,
      embedQuery: async () => [0],
      embedQueries: async () => [],
      embedDocuments: vi.fn(async (texts: string[]) => texts.map(() => [9])),
    };
    const embedder = prefetchedEmbedder(
      base,
      new Map([
        ["a", [1]],
        ["b", [2]],
      ]),
    );
    expect(await embedder.embedDocuments(["b", "a"])).toEqual([[2], [1]]);
    expect(base.embedDocuments).not.toHaveBeenCalled();
    expect(await embedder.embedDocuments(["a", "c"])).toEqual([[9], [9]]);
    expect(base.embedDocuments).toHaveBeenCalledOnce();
  });
  it("treats Prisma transaction start timeouts as transient", () => {
    expect(isTransient(Object.assign(new Error("x"), { code: "P2028" }))).toBe(
      true,
    );
    expect(
      isTransient(
        new Error(
          "Transaction API error: Unable to start a transaction in the given time.",
        ),
      ),
    ).toBe(true);
    expect(isTransient(Object.assign(new Error("x"), { code: "P2002" }))).toBe(
      false,
    );
  });
});
describe("Pub/Sub handoff", () => {
  function message(objectId = "findings/fixture.json") {
    return {
      attributes: {
        bucketId: "fixture",
        objectId,
        objectGeneration: "1",
        eventType: "OBJECT_FINALIZE",
      },
      ack: vi.fn(),
      nack: vi.fn(),
    };
  }
  it("acks only after durable enqueue with an idempotent job ID", async () => {
    const msg = message();
    const queue = {
      add: vi.fn(async () => {
        expect(msg.ack).not.toHaveBeenCalled();
      }),
    };
    await handleCorpusMessage(
      msg,
      queue as unknown as Parameters<typeof handleCorpusMessage>[1],
      "fixture",
    );
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.nack).not.toHaveBeenCalled();
    expect(queue.add.mock.calls[0]).toEqual([
      "ingest",
      msg.attributes,
      {
        jobId: "findings/fixture.json#1#OBJECT_FINALIZE",
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      },
    ]);
  });
  it("nacks failed enqueues and ignores reports", async () => {
    const msg = message();
    const queue = {
      add: vi.fn(async () => {
        throw new Error("Redis unavailable");
      }),
    };
    await handleCorpusMessage(
      msg,
      queue as unknown as Parameters<typeof handleCorpusMessage>[1],
      "fixture",
    );
    expect(msg.nack).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
    const report = message("_reports/findings/fixture.result.json");
    await handleCorpusMessage(
      report,
      queue as unknown as Parameters<typeof handleCorpusMessage>[1],
      "fixture",
    );
    expect(report.ack).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });
});
