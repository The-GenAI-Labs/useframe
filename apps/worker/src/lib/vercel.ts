import { env } from "../config/env.js"
import type { BuiltFile } from "./staticSiteBuilder.js"

const VERCEL_API = "https://api.vercel.com"

function withTeamQuery(url: string): string {
  const params = new URLSearchParams()
  if (env.VERCEL_TEAM_ID) params.set("teamId", env.VERCEL_TEAM_ID)
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function vercelFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(withTeamQuery(`${VERCEL_API}${path}`), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : `Vercel API request failed (${res.status})`
    throw new Error(message)
  }

  return body
}

export type VercelDeploymentResult = {
  id: string
  url: string
  readyState: string
  vercelProjectId: string | null
}

export async function createVercelDeployment(
  projectName: string,
  files: BuiltFile[]
): Promise<VercelDeploymentResult> {
  const body = await vercelFetch("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      target: "production",
      files: files.map((f) => ({
        file: f.path,
        data: f.content.toString("base64"),
        encoding: "base64",
      })),
      projectSettings: {
        framework: null,
      },
    }),
  })

  const deployment = body as { id: string; url: string; readyState: string; projectId?: string }
  return {
    id: deployment.id,
    url: deployment.url,
    readyState: deployment.readyState,
    vercelProjectId: deployment.projectId ?? null,
  }
}

export async function getVercelDeployment(deploymentId: string): Promise<VercelDeploymentResult> {
  const body = await vercelFetch(`/v13/deployments/${deploymentId}`, { method: "GET" })
  const deployment = body as { id: string; url: string; readyState: string; projectId?: string }
  return {
    id: deployment.id,
    url: deployment.url,
    readyState: deployment.readyState,
    vercelProjectId: deployment.projectId ?? null,
  }
}

export type VercelDomainStatus = {
  verified: boolean
  sslStatus: string | null
}

export async function getVercelDomainStatus(vercelProjectId: string, domain: string): Promise<VercelDomainStatus> {
  const body = await vercelFetch(
    `/v9/projects/${vercelProjectId}/domains/${encodeURIComponent(domain)}`,
    { method: "GET" }
  )
  const result = body as { verified?: boolean }
  return { verified: !!result.verified, sslStatus: result.verified ? "issued" : null }
}
