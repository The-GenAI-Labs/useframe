import { fetchWithAuthRetry } from "@/lib/authContext"
import type {
  ExtractedFields,
  ExtractResponse,
  ExtractAnswerResponse,
  Tier,
} from "@repo/schemas"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

async function orchestratorPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithAuthRetry(`${ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const responseBody = (await res.json()) as
    | { success: true; data: T }
    | { success: false; message?: string }

  if (!res.ok || !responseBody.success) {
    const message = "message" in responseBody ? responseBody.message : "Request failed"
    throw new Error(message ?? "Request failed")
  }

  return responseBody.data
}

export const extractApi = {
  extract: (ideaText: string, tier: Tier): Promise<ExtractResponse> =>
    orchestratorPost<ExtractResponse>("/extract", { ideaText, tier }),

  answer: (
    extracted: ExtractedFields,
    answers: Record<string, string>,
  ): Promise<ExtractAnswerResponse> =>
    orchestratorPost<ExtractAnswerResponse>("/extract/answer", { extracted, answers }),
}
