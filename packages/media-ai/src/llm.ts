import type { RoutingKey } from "./constants.js"

export type LlmImage = { mime: "image/png" | "image/webp" | "image/jpeg"; base64: string }

export type LlmRequest = {
  routingKey: RoutingKey
  system: string
  prompt: string
  images?: LlmImage[]
  maxTokens?: number
  // Telemetry label (e.g. "media.concepts"); never user text.
  purpose: string
}

export type LlmResponse = { text: string; costUsd?: number; refused?: boolean }

export interface Llm {
  complete(req: LlmRequest): Promise<LlmResponse>
}

export class LlmValidationError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly attempts: number,
  ) {
    super(`LLM output failed validation: ${errors.slice(0, 5).join("; ")}`)
    this.name = "LlmValidationError"
  }
}

export class LlmRefusalError extends Error {
  constructor() {
    super("The model declined this request")
    this.name = "LlmRefusalError"
  }
}

export function parseJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export type Parse<T> = (raw: unknown) => { ok: true; value: T } | { ok: false; errors: string[] }

export function repairNote(errors: readonly string[]): string {
  return `\n\nYour previous answer failed validation:\n${errors.slice(0, 20).map((e) => `- ${e}`).join("\n")}\nReturn the complete corrected JSON only.`
}

// One call plus at most one repair call that names the exact validation errors.
export async function callJson<T>(
  llm: Llm,
  req: LlmRequest,
  parse: Parse<T>,
  attempts = 2,
): Promise<{ value: T; attempts: number; costUsd: number }> {
  let errors: string[] = []
  let costUsd = 0
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await llm.complete(attempt === 1 ? req : { ...req, prompt: req.prompt + repairNote(errors) })
    costUsd += res.costUsd ?? 0
    if (res.refused) throw new LlmRefusalError()
    const raw = parseJsonObject(res.text)
    if (raw === null) {
      errors = ["the answer was not a JSON object"]
      continue
    }
    const result = parse(raw)
    if (result.ok) return { value: result.value, attempts: attempt, costUsd }
    errors = result.errors
  }
  throw new LlmValidationError(errors, attempts)
}

export function zodParse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } } }): Parse<T> {
  return (raw) => {
    const r = schema.safeParse(raw)
    return r.success
      ? { ok: true, value: r.data }
      : { ok: false, errors: r.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "root"}: ${i.message}`) }
  }
}
