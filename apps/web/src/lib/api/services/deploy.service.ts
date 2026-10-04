import { api } from "../axios"

export type DeploymentStatus =
  | "QUEUED"
  | "BUILDING"
  | "UPLOADING"
  | "DNS_PROVISIONING"
  | "ACTIVATING"
  | "LIVE"
  | "FAILED"
  | "ROLLED_BACK"
  | "SUPERSEDED"

export const IN_FLIGHT_STATUSES: DeploymentStatus[] = ["QUEUED", "BUILDING", "UPLOADING", "ACTIVATING"]

export type Deployment = {
  id: string
  status: DeploymentStatus
  triggeredBy: string
  liveUrl: string | null
  failureReason: string | null
  buildDurationMs: number | null
  createdAt: string
  deployedAt: string | null
  failedAt: string | null
  purgedAt: string | null
}

export type ProjectSite = {
  subdomainLabel: string
  defaultHost: string
  primaryHost: string
  liveUrl: string
  suspended: boolean
  suspendedReason: string | null
  activeDeployment: Deployment | null
}

export const deployApi = {
  create: async (slug: string) => {
    const { data } = await api.post<{
      success: true
      data: { deploymentId: string; status: DeploymentStatus; host: string }
    }>(`/projects/${slug}/deploy`)
    return data.data
  },

  list: async (slug: string) => {
    const { data } = await api.get<{ success: true; data: Deployment[] }>(`/projects/${slug}/deployments`)
    return data.data
  },

  site: async (slug: string) => {
    const { data } = await api.get<{ success: true; data: ProjectSite | null }>(`/projects/${slug}/site`)
    return data.data
  },

  rollback: async (slug: string, deploymentId: string) => {
    const { data } = await api.post<{ success: true; data: Deployment }>(
      `/projects/${slug}/deployments/${deploymentId}/rollback`,
      undefined,
      { timeout: 210_000 }
    )
    return data.data
  },
}
