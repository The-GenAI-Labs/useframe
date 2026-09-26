import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { ResearchAgentRequest, ResearchReportData } from "@repo/schemas"
import { DEFAULT_RESEARCH_PROMPT } from "@/prompts/research.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON found in LLM response")
  return JSON.parse(match[0])
}

function fallbackReport(request: ResearchAgentRequest): ResearchReportData {
  return {
    summary: `A clean, trust-building design direction for ${request.startupIdea.slice(0, 60)}.`,
    primaryColor: "#4F46E5",
    secondaryColor: "#F9FAFB",
    accentColor: "#7C3AED",
    colorPalette: {},
    colorRationale: "Deep indigo signals trust and competence for a broad audience.",
    fontPrimary: "Inter",
    fontSecondary: "Playfair Display",
    typographyRationale: "High x-height sans-serif improves readability at small sizes.",
    layoutStyle: "Single-page scroll",
    layoutRationale: "A single-page layout suits a clear, focused value proposition.",
    imageStyle: "Clean editorial photography",
    imageDirection: {},
    imageRationale: "Authentic imagery builds trust faster than stock illustration.",
    citations: [],
    confidenceScore: 40,
  }
}

export async function runResearchAgent(
  request: ResearchAgentRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
): Promise<ResearchReportData> {
  const prompt = DEFAULT_RESEARCH_PROMPT({
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
    feedback: request.feedback,
    previousReport: request.previousReport,
    scannedCompetitors: request.scannedCompetitors,
  })

  const { text } = await generateText({
    model,
    prompt,
    maxTokens: 1800,
    providerOptions,
    experimental_telemetry: { isEnabled: true, functionId: "research-agent" },
  })

  try {
    return extractJson(text) as ResearchReportData
  } catch {
    return fallbackReport(request)
  }
}
