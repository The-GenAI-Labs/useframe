import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

export type CreateScoreResult = { scoreId: string; cached?: boolean }
export type GetScoreResult = {
  status: string
  report: unknown
  url: string
  failureReason: string | null
}
export type GetScoreScreenshotResult = { screenshotBase64: string }

async function scoringFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SCORING_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message: string }
    | null

  if (!res.ok || !body?.success) {
    const message = body && "message" in body ? body.message : "Scoring service request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export function callCreateScore(
  url: string,
  userId: string,
  force?: boolean
): Promise<CreateScoreResult> {
  return scoringFetch<CreateScoreResult>("/score", {
    method: "POST",
    body: JSON.stringify({ url, userId, force }),
  })
}

export function callGetScore(scoreId: string): Promise<GetScoreResult> {
  return scoringFetch<GetScoreResult>(`/score/${scoreId}`)
}

export function callGetScreenshot(scoreId: string): Promise<GetScoreScreenshotResult> {
  return scoringFetch<GetScoreScreenshotResult>(`/score/${scoreId}/screenshot`)
}
