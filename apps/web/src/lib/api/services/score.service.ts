import { api } from "../axios"

export type ScoreCriterionResult = {
  score: number
  explanation: string
  citation: string
  issues: string[]
}

export type PerformanceMetrics = {
  ttfb: number
  domContentLoaded: number
  loadComplete: number
  lcp: number
}

export type PerformanceCriterionResult = ScoreCriterionResult & {
  metrics: PerformanceMetrics
}

export type ScoreReport = {
  visualHierarchy: ScoreCriterionResult
  typographyReadability: ScoreCriterionResult
  colorContrastA11y: ScoreCriterionResult
  copyPersuasion: ScoreCriterionResult
  seoTechnical: ScoreCriterionResult
  // Optional: measured, and absent from reports cached before the
  // Performance & Speed criterion existed (scorer v1).
  performanceSpeed?: PerformanceCriterionResult
  overallScore: number
}

export type GetScoreResponse = {
  status: "PENDING" | "SCANNING" | "ANALYZING" | "DONE" | "FAILED"
  report: ScoreReport | null
  url: string
  failureReason: string | null
}

export const scoreApi = {
  create: async (url: string, force?: boolean) => {
    const { data } = await api.post<{
      success: true
      data: { scoreId: string; cached?: boolean }
    }>("/score", { url, force })
    return data.data
  },

  get: async (scoreId: string) => {
    const { data } = await api.get<{ success: true; data: GetScoreResponse }>(
      `/score/${scoreId}`
    )
    return data.data
  },

  getScreenshot: async (scoreId: string) => {
    const { data } = await api.get<{
      success: true
      data: { screenshotBase64: string }
    }>(`/score/${scoreId}/screenshot`)
    return data.data
  },
}
