import { env } from "@/config/env.js"

export type AnalyzePayload = {
  scoreId: string
  url: string
  screenshotBase64: string
  extractedContent: unknown
  designTokens: unknown
  performanceMetrics?: {
    ttfb: number
    domContentLoaded: number
    loadComplete: number
    lcp: number
  }
}

export type AnalyzeResult = {
  report: unknown
}

export async function callAnalyze(payload: AnalyzePayload): Promise<AnalyzeResult> {
  const res = await fetch(`${env.SCORING_SERVICE_URL}/internal/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: AnalyzeResult }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Scoring service request failed"
    throw new Error(message)
  }

  return body.data
}
