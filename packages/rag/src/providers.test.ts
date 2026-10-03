import { afterEach, describe, it, expect, vi } from "vitest";
import { voyageProvider } from "./embeddings.js";
import { RagEnvSchema } from "./config.js";
import { requestJson } from "./http.js";
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
      await provider.embedDocuments(Array.from({ length: 129 }, () => "words")),
    ).toHaveLength(129);
    await provider.embedQuery("query");
    expect(calls.map((c) => c.input.length)).toEqual([128, 1, 1]);
    expect(calls.map((c) => c.input_type)).toEqual([
      "document",
      "document",
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
