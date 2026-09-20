import { api } from "../axios"

export type DeploymentStatus =
  | "QUEUED"
  | "BUILDING"
  | "UPLOADING"
  | "DNS_PROVISIONING"
  | "LIVE"
  | "FAILED"
  | "ROLLED_BACK"

export type DeploymentResult = {
  id: string
  status: DeploymentStatus
  liveUrl: string | null
  failureReason: string | null
  buildDurationMs: number | null
}

export const deployApi = {
  create: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: { deploymentId: string } }>(
      `/projects/${slug}/deploy`
    )
    return data.data
  },

  get: async (slug: string, deploymentId: string) => {
    const { data } = await api.get<{ success: true; data: DeploymentResult }>(
      `/projects/${slug}/deploy/${deploymentId}`
    )
    return data.data
  },

  approve: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/deploy/approve`
    )
    return data.data
  },
}
