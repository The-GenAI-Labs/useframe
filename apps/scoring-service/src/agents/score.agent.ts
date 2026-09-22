import { generateText } from "ai"
import { getVisionModel } from "@/llm/providers.js"
import { DEFAULT_SCORE_PROMPT } from "@/prompts/score.prompt.js"
import {
  scorePerformance,
  type PerformanceCriterion,
  type PerformanceMetrics,
} from "@/criteria/performanceSpeed.js"

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
  performanceSpeed?: PerformanceCriterion
  overallScore: number
}

export type RunScoreInput = {
  url: string
  screenshotBase64: string
  extractedContent: unknown
  designTokens: unknown
  performanceMetrics?: PerformanceMetrics
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

  const report = extractJson(result.text) as ScoreReport

  // Performance is measured, not judged — it's appended after the LLM call
  // and the overall is recomputed across 6 criteria rather than trusting the
  // model's own 5-criterion average.
  if (input.performanceMetrics) {
    const performanceSpeed = scorePerformance(input.performanceMetrics)
    const criteria = [
      report.visualHierarchy,
      report.typographyReadability,
      report.colorContrastA11y,
      report.copyPersuasion,
      report.seoTechnical,
    ]
    const sum = criteria.reduce((acc, c) => acc + (c?.score ?? 0), 0) + performanceSpeed.score

    return {
      ...report,
      performanceSpeed,
      overallScore: Math.round(sum / (criteria.length + 1)),
    }
  }

  return report
}
