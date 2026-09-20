import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import jwt from "jsonwebtoken"

const __dirname = dirname(fileURLToPath(import.meta.url))

type VariationInput = { startupIdea: string; niche: string; targetAudience: string }

type PlanBrief = {
  colors: { primary: string }
  typography: { primary: string }
  layout: { sections: string[] }
}

export type VariationCheckResult = {
  pass: boolean
  uniqueColors: number
  uniqueFonts: number
  uniqueLayouts: number
  sampleSize: number
  errors: string[]
}

const MIN_UNIQUE_COLORS = 6
const MIN_UNIQUE_FONTS = 4
const MIN_UNIQUE_LAYOUTS = 5

function mintInternalToken(): string {
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) throw new Error("JWT_ACCESS_SECRET must be set to run the variation check")
  return jwt.sign(
    { id: "evals-runner", email: "evals@useframe.internal", plan: "internal", type: "access" },
    secret,
    { expiresIn: "5m" }
  )
}

/**
 * The anti-sameness test: generates a DesignBrief for each of 10 inputs
 * spanning different domains via a live orchestrator-service, and checks
 * that the Planner LLM isn't collapsing to the same handful of colors/
 * fonts/layouts regardless of input — the specific risk this whole RAG
 * pipeline exists to avoid. Requires a running orchestrator-service; not
 * run on every PR by default (see runEvals.ts's --tier flag).
 */
export async function runVariationCheck(orchestratorUrl: string): Promise<VariationCheckResult> {
  const inputs: VariationInput[] = JSON.parse(
    readFileSync(join(__dirname, "../../datasets/variation-inputs.json"), "utf-8")
  )

  const token = mintInternalToken()
  const briefs: PlanBrief[] = []
  const errors: string[] = []

  for (const input of inputs) {
    try {
      const res = await fetch(`${orchestratorUrl}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      })
      const body = (await res.json()) as { success: boolean; data?: { brief: PlanBrief }; message?: string }
      if (!res.ok || !body.success || !body.data) {
        errors.push(`${input.startupIdea}: ${body.message ?? `HTTP ${res.status}`}`)
        continue
      }
      briefs.push(body.data.brief)
    } catch (err) {
      errors.push(`${input.startupIdea}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const uniqueColors = new Set(briefs.map((b) => b.colors.primary)).size
  const uniqueFonts = new Set(briefs.map((b) => b.typography.primary)).size
  const uniqueLayouts = new Set(briefs.map((b) => JSON.stringify(b.layout.sections))).size

  return {
    pass:
      uniqueColors >= MIN_UNIQUE_COLORS &&
      uniqueFonts >= MIN_UNIQUE_FONTS &&
      uniqueLayouts >= MIN_UNIQUE_LAYOUTS,
    uniqueColors,
    uniqueFonts,
    uniqueLayouts,
    sampleSize: briefs.length,
    errors,
  }
}
