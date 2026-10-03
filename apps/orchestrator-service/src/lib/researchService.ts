import { env } from "@/config/env.js";
import type {
  CitationToSave,
  ProjectResearchView,
  RetrievalInput,
  RetrievalResult,
} from "@repo/schemas";
import type {
  PlannerRetrievalResult,
  PlannerDomainPattern,
  PlannerAudienceModifier,
} from "@/prompts/planner.prompt.js";

class ResearchServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function researchFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.RESEARCH_SERVICE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(180000),
    headers: {
      "Content-Type": "application/json",
      ...(env.INTERNAL_SERVICE_SECRET
        ? { "x-internal-secret": env.INTERNAL_SERVICE_SECRET }
        : {}),
      ...init?.headers,
    },
  });

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message: string }
    | null;

  if (!res.ok || !body?.success) {
    const message =
      body && "message" in body
        ? body.message
        : "Research service request failed";
    throw new ResearchServiceError(message, res.status);
  }

  return body.data;
}

export function retrieveForProject(
  input: RetrievalInput,
): Promise<RetrievalResult> {
  return researchFetch<RetrievalResult>("/retrieve/project", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveCitations(
  researchReportId: string,
  citations: CitationToSave[],
): Promise<void> {
  await researchFetch<null>("/citations", {
    method: "POST",
    body: JSON.stringify({ researchReportId, citations }),
  });
}

export async function getProjectResearch(
  projectId: string,
): Promise<ProjectResearchView | null> {
  try {
    return await researchFetch<ProjectResearchView>(
      `/projects/${encodeURIComponent(projectId)}/research/citations`,
    );
  } catch (err) {
    if (err instanceof ResearchServiceError && err.status === 404) return null;
    throw err;
  }
}

export function callRetrieve(
  queries: { query: string; decision: string }[],
  domain: string,
  audience: string,
): Promise<{ results: PlannerRetrievalResult[] }> {
  return researchFetch<{ results: PlannerRetrievalResult[] }>("/retrieve", {
    method: "POST",
    body: JSON.stringify({ queries, domain, audience }),
  });
}

export async function callDomainPattern(
  domain: string,
): Promise<PlannerDomainPattern | null> {
  try {
    return await researchFetch<PlannerDomainPattern>(
      `/domain-pattern/${encodeURIComponent(domain)}`,
    );
  } catch {
    return null;
  }
}

export async function callAudienceModifier(
  audience: string,
): Promise<PlannerAudienceModifier | null> {
  try {
    return await researchFetch<PlannerAudienceModifier>(
      `/audience-modifier/${encodeURIComponent(audience)}`,
    );
  } catch {
    return null;
  }
}
