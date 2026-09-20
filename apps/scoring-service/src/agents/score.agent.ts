import { generateText } from "ai"
import { getVisionModel } from "@/llm/providers.js"
import { DEFAULT_SCORE_PROMPT } from "@/prompts/score.prompt.js"

export type ScoreCriterion = {
  score: number
  explanation: string
  citation: string
  issues: string[]
}

export type ScoreReport = {
  visualHierarchy: ScoreCriterion
  typographyReadability: ScoreCriterion
  colorContrastA11y: ScoreCriterion
  copyPersuasion: ScoreCriterion
  seoTechnical: ScoreCriterion
  overallScore: number
}

export type RunScoreInput = {
  url: string
  screenshotBase64: string
  extractedContent: unknown
  designTokens: unknown
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON found in LLM response")
  return JSON.parse(match[0])
}

export async function runScore(input: RunScoreInput): Promise<ScoreReport> {
  const model = getVisionModel()

  const prompt = DEFAULT_SCORE_PROMPT({
    url: input.url,
    extractedContent: input.extractedContent,
    designTokens: input.designTokens,
  })

  const result = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            image: input.screenshotBase64,
          },
        ],
      },
    ],
    maxTokens: 3000,
  })

  return extractJson(result.text) as ScoreReport
}
