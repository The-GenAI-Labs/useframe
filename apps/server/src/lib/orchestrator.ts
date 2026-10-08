import type {
  IterateRequest,
  IterateResponse,
  ChatRequest,
  ChatResponse,
  ResearchAgentRequest,
  ResearchReportData,
  SeoMaterializeRequest,
  SeoMaterializeResponse,
  DesignBrief,
} from "@repo/schemas"
import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

export type PlanRequest = {
  projectId?: string
  versionId?: string
  startupIdea: string
  niche: string
  targetAudience: string
  brandPersonality?: string
  pricePositioning?: string
  businessModel?: string
  differentiator?: string
}

export async function callIterate(
  payload: IterateRequest,
  userToken: string
): Promise<IterateResponse> {
  const res = await fetch(`${env.ORCHESTRATOR_URL}/iterate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: IterateResponse }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export async function callResearch(
  payload: ResearchAgentRequest,
  userToken: string
): Promise<ResearchReportData> {
  const res = await fetch(`${env.ORCHESTRATOR_URL}/research`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: ResearchReportData }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export type PlanCandidates = {
  candidateA: { brief: DesignBrief; previewUrl: string }
  candidateB: { brief: DesignBrief; previewUrl: string }
  recommended: "A" | "B"
  recommendedReason: string
}

export async function callPlan(
  payload: PlanRequest,
  userToken: string
): Promise<{ brief: DesignBrief; candidates?: PlanCandidates }> {
  // orchestrator-service's POST /plan was converted to an SSE endpoint for
  // the new tier-gated generation flow — this untouched DesignBrief-approval
  // workflow (apps/server/src/modules/plan) calls the plain-JSON /plan/sync
  // variant instead, which preserves the exact response contract below.
  const res = await fetch(`${env.ORCHESTRATOR_URL}/plan/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: { brief: DesignBrief; candidates?: PlanCandidates } }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return { brief: body.data.brief, candidates: body.data.candidates }
}

export async function callSeoMaterialize(
  payload: SeoMaterializeRequest,
  userToken: string
): Promise<SeoMaterializeResponse> {
  const res = await fetch(`${env.ORCHESTRATOR_URL}/seo/materialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: SeoMaterializeResponse }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export async function callChat(
  payload: ChatRequest,
  userToken: string
): Promise<ChatResponse> {
  const res = await fetch(`${env.ORCHESTRATOR_URL}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = (await res.json()) as
    | { success: true; data: ChatResponse }
    | { success: false; message: string }

  if (!res.ok || !body.success) {
    const message = "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export type BriefPrefillPayload =
  | { briefId: string; kind: "text"; text: string }
  | { briefId: string; kind: "url"; url: string }
  | { briefId: string; kind: "doc"; uploadId: string }

export type BriefPrefillResult = {
  values: Record<string, unknown>
  confidence: Record<string, number>
  excerpts: Record<string, string>
}

async function orchestratorJson<T>(path: string, payload: unknown, userToken: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${env.ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  })

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message: string }
    | null

  if (!res.ok || !body?.success) {
    const message = body && "message" in body ? body.message : "Orchestrator request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export function callBriefPrefill(
  payload: BriefPrefillPayload,
  userToken: string,
  signal: AbortSignal
): Promise<BriefPrefillResult> {
  return orchestratorJson<BriefPrefillResult>("/brief/prefill", payload, userToken, signal)
}

export function callBriefResolve(
  briefId: string,
  userToken: string
): Promise<{ status: string }> {
  return orchestratorJson<{ status: string }>("/brief/resolve", { briefId }, userToken, AbortSignal.timeout(60_000))
}
