import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

export type FindingResult = {
  id: string
  claim: string
  paper: string
  field: string
  decision: string
  options: { value: string; label: string; fits: string[] }[]
  contextHeader: string
  verified: boolean
}

async function researchFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.RESEARCH_SERVICE_URL}${path}`, {
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
    const message = body && "message" in body ? body.message : "Research service request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export function callGetFinding(id: string): Promise<FindingResult> {
  return researchFetch<FindingResult>(`/finding/${encodeURIComponent(id)}`)
}
