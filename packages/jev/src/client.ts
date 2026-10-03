import { z } from "zod";
import { jevConfig } from "./config.js";
const NoulSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().finite().min(0).max(1),
});
const ChoiceSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().finite().min(0).max(1),
  probabilities: z.record(z.number().finite().min(0).max(1)),
});
const AnswerSchema = z.discriminatedUnion("type", [NoulSchema, ChoiceSchema]);
export const choiceOf = (answer: unknown) => {
  const parsed = ChoiceSchema.safeParse(answer);
  return parsed.success ? parsed.data : null;
};
export const noulP = (answer: unknown): number | null => {
  const parsed = NoulSchema.safeParse(answer);
  return parsed.success ? parsed.data.noul : null;
};
export async function jevEvaluate(
  questions: Record<
    string,
    | { type: "noul"; instructions: string }
    | { type: "choice"; instructions: string; criteria: Record<string, string> }
  >,
  state: unknown,
  signal?: AbortSignal,
) {
  const config = jevConfig();
  if (!config.TYPESAFE_API_KEY) return null;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: config.JEV_MODEL, state, questions }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(config.JEV_TIMEOUT_MS)])
        : AbortSignal.timeout(config.JEV_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const result = z
      .object({ model: z.string(), answers: z.record(AnswerSchema) })
      .parse(await response.json());
    for (const [key, question] of Object.entries(questions)) {
      const answer = result.answers[key];
      if (!answer || answer.type !== question.type) return null;
      if (question.type === "choice" && answer.type === "choice") {
        const keys = Object.keys(question.criteria);
        if (
          !keys.includes(answer.choice) ||
          keys.some((k) => answer.probabilities[k] === undefined) ||
          Object.keys(answer.probabilities).some((k) => !keys.includes(k))
        )
          return null;
        if (
          Math.abs(
            Object.values(answer.probabilities).reduce((a, b) => a + b, 0) - 1,
          ) > 0.01
        )
          return null;
      }
    }
    return result;
  } catch {
    return null;
  }
}
