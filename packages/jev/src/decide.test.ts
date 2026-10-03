import { afterEach, it, expect, vi } from "vitest";
import { createDecider, flushJev, type DecisionOptions } from "./decide.js";
import { getJevMode } from "./config.js";
import { jevEvaluate, noulP } from "./client.js";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const setup = () => {
  const log = vi.fn(async () => {}),
    promotable = vi.fn(async () => true);
  const options: DecisionOptions<string[]> = {
    feature: "retrieval_cache_verify",
    policyKey: "policy",
    mode: "on",
    timeoutMs: 50,
    baseline: vi.fn(async () => ["fresh"]),
    viaJev: vi.fn(async () => ["cached"]),
    same: (a, b) => a[0] === b[0],
    logInput: { area: "COLOR" },
  };
  return {
    log,
    promotable,
    options,
    decide: createDecider({ log, promotable }),
  };
};
it("defaults to off", () => {
  vi.stubEnv("JEV_MODE_RETRIEVAL_CACHE_VERIFY", "");
  expect(getJevMode("retrieval_cache_verify")).toBe("off");
});
it("off skips Jev and logging", async () => {
  const t = setup();
  t.options.mode = "off";
  expect(await t.decide(t.options)).toEqual(["fresh"]);
  expect(t.options.viaJev).not.toHaveBeenCalled();
  expect(t.log).not.toHaveBeenCalled();
});
it("on requires promotion evidence and otherwise remains shadow", async () => {
  const t = setup();
  t.promotable.mockResolvedValue(false);
  expect(await t.decide(t.options)).toEqual(["fresh"]);
  await flushJev();
  expect(t.log).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "shadow", agreement: false }),
  );
});
it("on accepts without calling baseline", async () => {
  const t = setup();
  expect(await t.decide(t.options)).toEqual(["cached"]);
  expect(t.options.baseline).not.toHaveBeenCalled();
  await flushJev();
});
it("timeouts abort and fall through within the configured budget", async () => {
  vi.useFakeTimers();
  const t = setup();
  let signal: AbortSignal | undefined;
  t.options.viaJev = vi.fn(async (s) => {
    signal = s;
    return new Promise(() => {});
  });
  const result = t.decide(t.options);
  await vi.advanceTimersByTimeAsync(51);
  expect(await result).toEqual(["fresh"]);
  expect(signal?.aborted).toBe(true);
  await flushJev();
});
it("provider exceptions never prevent baseline", async () => {
  const t = setup();
  t.options.viaJev = vi.fn().mockRejectedValue(new Error("down"));
  expect(await t.decide(t.options)).toEqual(["fresh"]);
  await flushJev();
});
it("shadow returns before verifier and logs comparison later", async () => {
  const t = setup();
  t.options.mode = "shadow";
  let resolve!: (value: string[]) => void;
  t.options.viaJev = () =>
    new Promise((r) => {
      resolve = r;
    });
  expect(await t.decide(t.options)).toEqual(["fresh"]);
  expect(t.log).not.toHaveBeenCalled();
  resolve(["fresh"]);
  await flushJev();
  expect(t.log).toHaveBeenCalledWith(
    expect.objectContaining({ agreement: true }),
  );
});
it("validates Noul probability rather than a separate confidence field", () => {
  expect(noulP({ type: "noul", noul: 0.8 })).toBe(0.8);
  expect(noulP({ type: "noul", noul: 2 })).toBeNull();
});
it("uses official endpoint and treats invalid/missing answers as unavailable", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model: "jev-1.13.0",
      answers: { stillValid: { type: "noul", noul: 0.9 } },
    }),
  });
  vi.stubGlobal("fetch", fetch);
  expect(
    await jevEvaluate(
      { stillValid: { type: "noul", instructions: "valid?" } },
      { text: "fixture" },
    ),
  ).not.toBeNull();
  expect(fetch.mock.calls[0]?.[0]).toBe("https://api.typesafe.ai/v1/systemone");
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ model: "jev-1.13.0", answers: {} }),
  });
  expect(
    await jevEvaluate(
      { stillValid: { type: "noul", instructions: "valid?" } },
      {},
    ),
  ).toBeNull();
});
