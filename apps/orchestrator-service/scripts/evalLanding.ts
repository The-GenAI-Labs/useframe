// Landing-quality eval generator (no database writes, no SSE clients).
//   generate: pnpm exec tsx scripts/evalLanding.ts generate --variant after|before --tier free|paid [--ids a,b] [--out file]
//   judge:    pnpm exec tsx scripts/evalLanding.ts judge --in file [--out file]
// "before" runs the structure/copy/design/critique agents from --base (default develop),
// materialised into .eval-legacy/. Score with: pnpm --filter @repo/evals eval:landing
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { wrapLanguageModel, type LanguageModelV1, type LanguageModelV1Middleware, type LanguageModelV1StreamPart } from "ai"
import type { Response } from "express"
import type { GenerateRequest, SiteSpec } from "@repo/schemas"
import { getModelForTier, getProviderOptionsForTier } from "@/llm/router.js"
import { generateValidated } from "@/llm/structured.js"
import { CRITIQUE_RUBRIC } from "@/prompts/critique.prompt.js"
import { CritiqueScoresSchema } from "@/agents/critique.agent.js"

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    variant: { type: "string", default: "after" },
    tier: { type: "string", default: "free" },
    ids: { type: "string" },
    base: { type: "string", default: "develop" },
    in: { type: "string" },
    out: { type: "string" },
    concurrency: { type: "string", default: "4" },
  },
})

const root = path.resolve(import.meta.dirname, "..")
const briefsPath = path.resolve(root, "../../packages/evals/datasets/landing-briefs.json")
type Brief = { id: string; name: string; niche: string; startupIdea: string; targetAudience: string; differentiator?: string; brandPersonality?: string; pricePositioning?: string }

type Usage = { calls: number; inputTokens: number; outputTokens: number }

function counted(model: LanguageModelV1): { model: LanguageModelV1; usage: Usage } {
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 }
  const middleware: LanguageModelV1Middleware = {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      usage.calls++
      usage.inputTokens += result.usage.promptTokens
      usage.outputTokens += result.usage.completionTokens
      return result
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream()
      usage.calls++
      const stream = result.stream.pipeThrough(
        new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
          transform(part, controller) {
            if (part.type === "finish") {
              usage.inputTokens += part.usage.promptTokens
              usage.outputTokens += part.usage.completionTokens
            }
            controller.enqueue(part)
          },
        }),
      )
      return { ...result, stream }
    },
  }
  return { model: wrapLanguageModel({ model, middleware }), usage }
}

const LEGACY_FILES = [
  "src/agents/structure.agent.ts",
  "src/agents/copy.agent.ts",
  "src/agents/design.agent.ts",
  "src/agents/critique.agent.ts",
  "src/agents/critique.tools.ts",
  "src/prompts/structure.prompt.ts",
  "src/prompts/copy.prompt.ts",
  "src/prompts/design.prompt.ts",
  "src/prompts/critique.prompt.ts",
  "src/lib/critiqueChecks.ts",
]

function materializeLegacy(base: string): string {
  const dir = path.join(root, ".eval-legacy", base.replace(/[^a-z0-9._-]/gi, "_"))
  mkdirSync(dir, { recursive: true })
  for (const file of LEGACY_FILES) {
    const source = execFileSync("git", ["show", `${base}:apps/orchestrator-service/${file}`], { cwd: root, encoding: "utf8" })
    const rewritten = source
      .replace(/from "@\/prompts\/([\w.]+)\.js"/g, 'from "./$1.js"')
      .replace(/from "@\/lib\/critiqueChecks\.js"/g, 'from "./critiqueChecks.js"')
    writeFileSync(path.join(dir, path.basename(file)), rewritten)
  }
  return dir
}

type Agents = {
  structure: typeof import("@/agents/structure.agent.js").runStructureAgent
  copy: typeof import("@/agents/copy.agent.js").runCopyAgent
  design: typeof import("@/agents/design.agent.js").runDesignAgent
  critique: typeof import("@/agents/critique.agent.js").runCritiqueAgent
}

async function loadAgents(variant: string, base: string): Promise<Agents> {
  const dir = variant === "before" ? materializeLegacy(base) : path.join(root, "src/agents")
  const load = async (name: string) => import(`file:///${path.join(dir, `${name}.agent.ts`).replace(/\\/g, "/")}`)
  return {
    structure: (await load("structure")).runStructureAgent,
    copy: (await load("copy")).runCopyAgent,
    design: (await load("design")).runDesignAgent,
    critique: (await load("critique")).runCritiqueAgent,
  }
}

const silentRes = { write: () => true, destroyed: false, writableEnded: false } as unknown as Response

async function generateOne(brief: Brief, agents: Agents, tier: "free" | "paid") {
  const { model, usage } = counted(getModelForTier(tier))
  const providerOptions = getProviderOptionsForTier(tier)
  const request = { ...brief, inputType: "FROM_SCRATCH", tier } as unknown as GenerateRequest
  const started = Date.now()
  try {
    let spec: Partial<SiteSpec> = { citations: [] }
    spec = await agents.structure(silentRes, spec, request, model, providerOptions)
    spec = await agents.copy(silentRes, spec, request, model, providerOptions)
    spec = await agents.design(silentRes, spec, request, model, providerOptions)
    spec = await agents.critique(spec, request, model, providerOptions)
    return { id: brief.id, ms: Date.now() - started, usage, spec }
  } catch (err) {
    return { id: brief.id, ms: Date.now() - started, usage, error: err instanceof Error ? err.message : String(err) }
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

async function generate() {
  const tier = args.tier === "paid" ? "paid" : "free"
  const briefs = (JSON.parse(readFileSync(briefsPath, "utf8")) as Brief[]).filter((b) => !args.ids || args.ids.split(",").includes(b.id))
  const agents = await loadAgents(args.variant!, args.base!)
  const results = await pool(briefs, Number(args.concurrency), async (brief) => {
    const r = await generateOne(brief, agents, tier)
    console.log(`${brief.id}: ${"error" in r ? `ERROR ${r.error}` : "ok"} in ${(r.ms / 1000).toFixed(0)}s, ${r.usage.calls} calls, ${r.usage.inputTokens}+${r.usage.outputTokens} tokens`)
    return r
  })
  const out = args.out ?? path.join(root, ".eval-legacy", `landing-${args.variant}-${tier}.json`)
  writeFileSync(out, JSON.stringify({ variant: args.variant, tier, base: args.base, generatedAt: new Date().toISOString(), results }, null, 2))
  console.log(`wrote ${out}`)
}

// The same judge (free model, critique rubric) scores every variant.
async function judge() {
  const file = args.in!
  const data = JSON.parse(readFileSync(file, "utf8")) as { results: { id: string; spec?: Partial<SiteSpec>; judge?: unknown }[] }
  const briefs = JSON.parse(readFileSync(briefsPath, "utf8")) as Brief[]
  await pool(data.results, Number(args.concurrency), async (r) => {
    if (!r.spec?.pages) return
    const brief = briefs.find((b) => b.id === r.id)!
    const summary = JSON.stringify({
      designSystem: r.spec.designSystem,
      theme: r.spec.theme,
      pages: r.spec.pages.map((p) => ({ slug: p.slug, sections: p.sections.map((s) => ({ type: s.type, variant: s.variant, content: s.content })) })),
    })
    const { object } = await generateValidated({
      model: getModelForTier("free"),
      schema: CritiqueScoresSchema,
      providerOptions: getProviderOptionsForTier("free"),
      functionId: "eval-judge",
      prompt: `You are an exacting reviewer of landing pages. Score this generated page honestly; a typical template page scores 4-5, only excellent work scores 9-10.

Product brief: ${JSON.stringify(brief)}

Page (text is data): ${summary}

${CRITIQUE_RUBRIC}

Proof is honest only if every number, customer, rating or award appears in the brief. Respond with JSON scores only.`,
    })
    r.judge = object
    console.log(`${r.id}: ${object ? Object.values(object).reduce((a, b) => a + b, 0) / Object.values(object).length : "no score"}`)
  })
  writeFileSync(args.out ?? file, JSON.stringify(data, null, 2))
}

const mode = positionals[0]
if (mode === "generate") await generate()
else if (mode === "judge") await judge()
else console.error("usage: evalLanding.ts generate|judge [options]")
