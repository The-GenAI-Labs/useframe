import { prisma } from "@useframe/db";
import { jevConfig, getJevMode } from "./config.js";
import type { DecisionEvent, JevFeature, JevMode } from "./types.js";
export async function bounded<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeout: number,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => fn(controller.signal))
        .catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export type DecisionOptions<T> = {
  feature: JevFeature;
  policyKey: string;
  mode?: JevMode;
  timeoutMs?: number;
  baseline: () => Promise<T>;
  viaJev: (signal: AbortSignal) => Promise<T | null>;
  same: (a: T, b: T) => boolean;
  rejectedAgreement?: (baseline: T) => boolean | null;
  logInput: Record<string, string | number>;
  confidence?: () => number | null;
  onDecision?: (event: DecisionEvent) => void;
};
export type DecisionRuntime = {
  log: (event: DecisionEvent) => Promise<void>;
  promotable: (feature: JevFeature, policyKey: string) => Promise<boolean>;
};
const runtime: DecisionRuntime = {
  log: async (event) => {
    await prisma.jevDecisionLog.create({ data: event });
  },
  promotable: async (feature, policyKey) => {
    if (feature === "chat_scope") {
      const shadow = await prisma.jevDecisionLog.findFirst({
        where: { feature, policyKey, mode: "shadow" },
        select: { id: true },
      });
      if (!shadow) return false;
      const evaluation = await prisma.jevDecisionLog.findMany({
        where: {
          feature,
          policyKey,
          mode: "evaluation",
          agreement: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { agreement: true },
      });
      return (
        evaluation.length === 50 &&
        evaluation.filter((row) => row.agreement).length / 50 >= 0.9
      );
    }
    const rows = await prisma.jevDecisionLog.findMany({
      where: { feature, policyKey, mode: "shadow", agreement: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { agreement: true },
    });
    return (
      rows.length >= 200 &&
      rows.filter((r) => r.agreement).length / rows.length >= 0.9
    );
  },
};
const pending = new Set<Promise<unknown>>();
function background(task: Promise<unknown>) {
  const safe = task.catch(() => {});
  pending.add(safe);
  void safe.finally(() => pending.delete(safe));
}
export async function flushJev() {
  await Promise.allSettled([...pending]);
}
export function createDecider(deps: DecisionRuntime = runtime) {
  return async function decide<T>(options: DecisionOptions<T>): Promise<T> {
    let mode = options.mode ?? getJevMode(options.feature);
    if (mode === "off") return options.baseline();
    if (
      mode === "on" &&
      !(await bounded(
        () => deps.promotable(options.feature, options.policyKey),
        500,
      ))
    )
      mode = "shadow";
    const started = Date.now();
    const candidate = bounded(
      options.viaJev,
      options.timeoutMs ?? jevConfig().JEV_TIMEOUT_MS,
    );
    const log = async (value: T | null, baseline?: T) => {
      const event: DecisionEvent = {
        feature: options.feature,
        mode,
        policyKey: options.policyKey,
        accepted: value !== null,
        agreement:
          value !== null && baseline !== undefined
            ? options.same(value, baseline)
            : baseline !== undefined
              ? (options.rejectedAgreement?.(baseline) ?? null)
              : null,
        confidence: options.confidence?.() ?? null,
        durationMs: Date.now() - started,
        input: options.logInput,
      };
      options.onDecision?.(event);
      await bounded(() => deps.log(event), 1000);
    };
    if (mode === "shadow") {
      const result = await options.baseline();
      background(candidate.then((value) => log(value, result)));
      return result;
    }
    const value = await candidate;
    if (value !== null) {
      background(log(value));
      return value;
    }
    background(log(null));
    return options.baseline();
  };
}
export const decide = createDecider();
