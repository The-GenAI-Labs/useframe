import { env } from "@/config/env.js"
import type {
  PlannerRetrievalResult,
  PlannerDomainPattern,
  PlannerAudienceModifier,
} from "@/prompts/planner.prompt.js"

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
    throw new Error(message)
  }

  return body.data
}

export function callRetrieve(
  queries: { query: string; decision: string }[],
  domain: string,
  audience: string,
): Promise<{ results: PlannerRetrievalResult[] }> {
  return researchFetch<{ results: PlannerRetrievalResult[] }>("/retrieve", {
    method: "POST",
    body: JSON.stringify({ queries, domain, audience }),
  })
}

export async function callDomainPattern(domain: string): Promise<PlannerDomainPattern | null> {
  try {
    return await researchFetch<PlannerDomainPattern>(`/domain-pattern/${encodeURIComponent(domain)}`)
  } catch {
    return null
  }
}

export async function callAudienceModifier(audience: string): Promise<PlannerAudienceModifier | null> {
  try {
    return await researchFetch<PlannerAudienceModifier>(`/audience-modifier/${encodeURIComponent(audience)}`)
  } catch {
    return null
  }
}
