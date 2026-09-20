import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

const VERCEL_API = "https://api.vercel.com"

function withTeamQuery(url: string): string {
  const params = new URLSearchParams()
  if (env.VERCEL_TEAM_ID) params.set("teamId", env.VERCEL_TEAM_ID)
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function vercelFetch(path: string, init: RequestInit): Promise<unknown> {
  if (!env.VERCEL_TOKEN) {
    throw new AppError("Custom domains are not configured on this server", 501)
  }

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
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body
}

export async function addVercelDomain(
  vercelProjectId: string,
  domain: string
): Promise<{ name: string; verified: boolean }> {
  const body = await vercelFetch(`/v10/projects/${vercelProjectId}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  })
  const result = body as { name: string; verified?: boolean }
  return { name: result.name, verified: !!result.verified }
}
