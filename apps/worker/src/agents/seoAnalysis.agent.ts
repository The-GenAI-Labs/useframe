import { generateText } from "ai"
import { getTextModel } from "../llm/providers.js"
import { DEFAULT_SEO_ANALYSIS_PROMPT } from "../prompts/seoAnalysis.prompt.js"

export type SeoFix = {
  priority: "high" | "medium" | "low"
  title: string
  detail: string
}

export type SeoAnalysisReport = {
  explanation: string
  fixes: SeoFix[]
}

export type RunSeoAnalysisInput = {
  domain: string
  tier: "free" | "paid"
  computedScore: number
  lighthouseSeoAudits: unknown
  paidTierData?: unknown
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON found in LLM response")
  return JSON.parse(match[0])
}

export async function runSeoAnalysis(input: RunSeoAnalysisInput): Promise<SeoAnalysisReport> {
  const model = getTextModel()
  const prompt = DEFAULT_SEO_ANALYSIS_PROMPT(input)

  const result = await generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
  })

  return extractJson(result.text) as SeoAnalysisReport
}
