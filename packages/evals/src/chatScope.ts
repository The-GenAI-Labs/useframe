import { readFile } from "node:fs/promises";
import { z } from "zod";
import { prisma, type Prisma } from "@useframe/db";
import {
  CHAT_TOPIC_MAP,
  chatScopePolicy,
  evaluateChatScope,
  jevConfig,
  flushJev,
} from "@repo/jev";
const cases = z
  .array(
    z.object({
      message: z.string(),
      topic: z.string(),
      history: z
        .array(z.object({ role: z.string(), content: z.string() }))
        .default([]),
    }),
  )
  .length(50)
  .parse(
    JSON.parse(
      await readFile(
        new URL("../datasets/jev/chat_scope/cases.json", import.meta.url),
        "utf8",
      ),
    ),
  );
const topics = new Set(cases.map((row) => row.topic));
if (Object.values(CHAT_TOPIC_MAP).some((topic) => !topics.has(topic)))
  throw new Error("Dataset must cover all topics");
if (!jevConfig().TYPESAFE_API_KEY)
  throw new Error("TYPESAFE_API_KEY is required for live scope evaluation");
const threshold = z.coerce
  .number()
  .min(0)
  .max(1)
  .default(0.65)
  .parse(process.env.OFF_TOPIC_THRESHOLD);
const policyKey = chatScopePolicy(threshold);
try {
  const rows: Prisma.JevDecisionLogCreateManyInput[] = [];
  for (const [index, row] of cases.entries()) {
    const started = Date.now();
    const plan = await evaluateChatScope(
      { message: row.message, recentHistory: row.history },
      threshold,
    );
    rows.push({
      feature: "chat_scope",
      mode: "evaluation",
      policyKey,
      accepted: plan !== null,
      agreement:
        plan?.topic === row.topic &&
        plan.action === (row.topic === "OFF_TOPIC" ? "refuse" : "answer"),
      confidence: plan?.confidence ?? null,
      durationMs: Date.now() - started,
      input: { caseIndex: index, expectedTopic: row.topic },
    });
  }
  const correct = rows.filter((row) => row.agreement).length;
  console.log(
    JSON.stringify({
      total: rows.length,
      correct,
      accuracy: correct / rows.length,
      policyKey,
      promotionEligible: correct >= 45,
    }),
  );
  if (process.argv.includes("--record")) {
    if (correct < 45)
      throw new Error("Evaluation failed; promotion evidence was not recorded");
    await prisma.$transaction(async (tx) => {
      await tx.jevDecisionLog.deleteMany({
        where: { feature: "chat_scope", mode: "evaluation", policyKey },
      });
      await tx.jevDecisionLog.createMany({ data: rows });
    });
  }
  if (correct < 45) process.exitCode = 1;
} finally {
  await flushJev();
  await prisma.$disconnect();
}
