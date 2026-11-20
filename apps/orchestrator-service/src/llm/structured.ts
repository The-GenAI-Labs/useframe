import { generateObject, streamObject, type LanguageModelV1 } from "ai"
import type { z } from "zod"
import type { getProviderOptionsForTier } from "./router.js"

// DeepSeek's thinking mode rejects tool mode's forced tool_choice and counts reasoning against
// maxTokens; Anthropic has no JSON mode, so it keeps tool mode.
export function objectMode(model: LanguageModelV1, maxTokens = 8000) {
  return model.provider.startsWith("anthropic") ? { maxTokens } : { mode: "json" as const, maxTokens: 16000 }
}

export type ValidatedResult<T> = { object: T | null; issues: string[]; attempts: number }

type Options<T> = {
  model: LanguageModelV1
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
  prompt: string
  system?: string
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>
  maxTokens?: number
  functionId: string
  validate?: (object: T) => string[]
  onDelta?: (delta: string) => void
}

function describeError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause
  const message = cause instanceof Error ? cause.message : err instanceof Error ? err.message : String(err)
  const schemaError = /NoObjectGenerated|TypeValidation|JSONParse/.test(err instanceof Error ? err.name : "")
  return `${schemaError ? "Output did not match the schema" : "Model call failed"}: ${message.slice(0, 1500)}`
}

async function once<T>(opts: Options<T>, prompt: string): Promise<T> {
  const common = {
    model: opts.model,
    schema: opts.schema,
    system: opts.system,
    prompt,
    providerOptions: opts.providerOptions,
    ...objectMode(opts.model, opts.maxTokens),
    experimental_telemetry: { isEnabled: true, functionId: opts.functionId },
  }
  if (!opts.onDelta) return (await generateObject(common)).object
  // A provider error ends the text stream but can leave `object` unsettled,
  // so it is captured and rethrown instead of awaited forever.
  let streamError: unknown
  const result = streamObject({ ...common, onError: ({ error }) => void (streamError ??= error) })
  for await (const delta of result.textStream) opts.onDelta(delta)
  if (streamError) throw streamError
  return await result.object
}

// One call, validated by the schema and by `validate`; on failure it retries
// once with the exact problems. The caller decides what to do with an object
// that still has issues (repair or deterministic fallback).
export async function generateValidated<T>(opts: Options<T>): Promise<ValidatedResult<T>> {
  let prompt = opts.prompt
  let last: T | null = null
  let issues: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const object = await once(opts, prompt)
      last = object
      issues = opts.validate?.(object) ?? []
      if (issues.length === 0) return { object, issues, attempts: attempt }
    } catch (err) {
      issues = [describeError(err)]
    }
    prompt = `${opts.prompt}

YOUR PREVIOUS ANSWER WAS REJECTED. Answer again in full and fix exactly these problems:
- ${issues.slice(0, 30).join("\n- ")}`
  }
  return { object: last, issues, attempts: 2 }
}
