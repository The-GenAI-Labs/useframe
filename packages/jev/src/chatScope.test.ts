import { afterEach, expect, it, vi } from "vitest";
import { createDecider, decide, flushJev } from "./decide.js";
import {
  CHAT_SCOPE_QUESTIONS,
  evaluateChatScope,
  planProjectChat,
} from "./chatScope.js";
import { choiceOf } from "./client.js";
const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@useframe/db", () => ({ prisma: { jevDecisionLog: db } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function provider(choice: string, confidence = 0.9) {
  vi.stubEnv("TYPESAFE_API_KEY", "test");
  const probabilities = Object.fromEntries(
    Object.keys(CHAT_SCOPE_QUESTIONS.topic.criteria).map((key) => [
      key,
      key === choice ? 1 : 0,
    ]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "jev-1.13.0",
            answers: {
              topic: { type: "choice", choice, confidence, probabilities },
            },
          }),
        ),
    ),
  );
}
it("on maps clear off-topic choice to fixed-refusal plan", async () => {
  provider("off_topic");
  vi.stubEnv("JEV_MODE_CHAT_SCOPE", "on");
  const run = createDecider({
    log: async () => {},
    promotable: async () => true,
  });
  expect(
    await planProjectChat(
      { message: "Write me a poem", recentHistory: [] },
      "p",
      0.65,
      undefined,
      run,
    ),
  ).toEqual({ action: "refuse", topic: "OFF_TOPIC", confidence: 0.9 });
  await flushJev();
});
it("maps all choice buckets and low-confidence off-topic falls open", async () => {
  for (const choice of Object.keys(CHAT_SCOPE_QUESTIONS.topic.criteria)) {
    provider(choice);
    expect((await evaluateChatScope({}, 0.65))?.topic).toBe(
      choice.toUpperCase(),
    );
  }
  provider("off_topic", 0.64);
  expect(await evaluateChatScope({}, 0.65)).toEqual({
    action: "answer",
    topic: null,
    confidence: 0.64,
  });
});
it("invalid choice confidence or unknown option is unavailable", async () => {
  expect(
    choiceOf({
      type: "choice",
      choice: "seo",
      confidence: 5,
      probabilities: { seo: 1 },
    }),
  ).toBeNull();
  provider("invented");
  expect(await evaluateChatScope({}, 0.65)).toBeNull();
});
it("chat_scope requires shadow first and 50 labeled evaluations, never baseline agreement", async () => {
  const options = {
    feature: "chat_scope" as const,
    policyKey: "policy",
    mode: "on" as const,
    baseline: async () => "baseline",
    viaJev: async () => "verified",
    same: () => true,
    logInput: {},
  };
  db.findFirst.mockResolvedValue(null);
  db.create.mockResolvedValue({});
  expect(await decide(options)).toBe("baseline");
  await flushJev();
  db.findFirst.mockResolvedValue({ id: "shadow" });
  db.findMany.mockResolvedValue(
    Array.from({ length: 49 }, () => ({ agreement: true })),
  );
  expect(await decide(options)).toBe("baseline");
  await flushJev();
  db.findMany.mockResolvedValue(
    Array.from({ length: 50 }, (_, i) => ({ agreement: i < 44 })),
  );
  expect(await decide(options)).toBe("baseline");
  await flushJev();
  db.findMany.mockResolvedValue(
    Array.from({ length: 50 }, (_, i) => ({ agreement: i < 45 })),
  );
  expect(await decide(options)).toBe("verified");
  await flushJev();
  expect(db.findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        mode: "evaluation",
        policyKey: "policy",
      }),
      take: 50,
    }),
  );
});
