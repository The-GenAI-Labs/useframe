import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { ragConfig } from "./config.js";

const parentContext = new AsyncLocalStorage<{
  traceId: string;
  spanId?: string;
}>();
export function withResearchTrace<T>(
  traceId: string | undefined,
  fn: () => T,
  spanId?: string,
): T {
  if (!traceId || !/^[a-f0-9]{32}$/.test(traceId)) return fn();
  return parentContext.run(
    {
      traceId,
      spanId: spanId && /^[a-f0-9]{16}$/.test(spanId) ? spanId : undefined,
    },
    fn,
  );
}
type Attribute = { key: string; value: { stringValue: string } };
type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Attribute[];
  status: { code: number };
};
const nanos = () => (BigInt(Date.now()) * 1000000n).toString();
export class ResearchTrace {
  readonly traceId =
    parentContext.getStore()?.traceId ?? randomBytes(16).toString("hex");
  readonly spanId = randomBytes(8).toString("hex");
  private spans: Span[] = [];
  private start = nanos();
  constructor(
    private name: string,
    private metadata: Record<string, unknown> = {},
  ) {}
  async span<T>(
    name: string,
    input: unknown,
    fn: () => Promise<T>,
    summarize: (result: T) => unknown = (result) => result,
  ): Promise<T> {
    const start = nanos();
    try {
      const result = await fn();
      this.record(name, start, { input, output: summarize(result) });
      return result;
    } catch (error) {
      this.record(
        name,
        start,
        {
          input,
          error: error instanceof Error ? error.message : "Operation failed",
        },
        true,
      );
      throw error;
    }
  }
  tag(key: string, value: unknown) {
    this.metadata[key] = value;
  }
  event(name: string, data: unknown) {
    this.record(name, nanos(), { output: data });
  }
  private record(
    name: string,
    start: string,
    data: Record<string, unknown>,
    failed = false,
  ) {
    this.spans.push({
      traceId: this.traceId,
      spanId: randomBytes(8).toString("hex"),
      parentSpanId: this.spanId,
      name,
      kind: 1,
      startTimeUnixNano: start,
      endTimeUnixNano: nanos(),
      attributes: Object.entries(data).map(([key, value]) => ({
        key: `langfuse.observation.${key}`,
        value: { stringValue: JSON.stringify(value) },
      })),
      status: { code: failed ? 2 : 1 },
    });
  }
  async finish(outcome: string) {
    const config = ragConfig();
    if (
      !config.LANGFUSE_HOST ||
      !config.LANGFUSE_PUBLIC_KEY ||
      !config.LANGFUSE_SECRET_KEY
    )
      return;
    const common: Attribute[] = [
      { key: "langfuse.trace.name", value: { stringValue: this.name } },
      {
        key: "langfuse.trace.tags",
        value: { stringValue: JSON.stringify([outcome]) },
      },
      ...Object.entries(this.metadata).map(([key, value]) => ({
        key: `langfuse.trace.metadata.${key}`,
        value: { stringValue: JSON.stringify(value) },
      })),
    ];
    this.spans.push({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: parentContext.getStore()?.spanId,
      name: this.name,
      kind: 1,
      startTimeUnixNano: this.start,
      endTimeUnixNano: nanos(),
      attributes: [],
      status: { code: outcome === "FAILED" ? 2 : 1 },
    });
    try {
      const response = await fetch(
        `${config.LANGFUSE_HOST.replace(/\/$/, "")}/api/public/otel/v1/traces`,
        {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: {
            "Content-Type": "application/json",
            "x-langfuse-ingestion-version": "4",
            Authorization: `Basic ${Buffer.from(`${config.LANGFUSE_PUBLIC_KEY}:${config.LANGFUSE_SECRET_KEY}`).toString("base64")}`,
          },
          body: JSON.stringify({
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    {
                      key: "service.name",
                      value: { stringValue: "useframe-rag" },
                    },
                  ],
                },
                scopeSpans: [
                  {
                    scope: { name: "@repo/rag" },
                    spans: this.spans.map((s) => ({
                      ...s,
                      attributes: [...s.attributes, ...common],
                    })),
                  },
                ],
              },
            ],
          }),
        },
      );
      if (!response.ok)
        console.warn(`[rag] Langfuse export returned HTTP ${response.status}`);
    } catch {
      console.warn("[rag] Langfuse export unavailable");
    }
  }
}
