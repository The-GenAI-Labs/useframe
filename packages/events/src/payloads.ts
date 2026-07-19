export type ScanJobPayload = {
  scanId: string
  userId: string
  projectId: string
  sourceUrl: string
  scanType: "COMPETITOR" | "OWN_SITE"
}

export type GenerateJobPayload = {
  projectId: string
  userId: string
  versionId: string
  startupIdea: string
  niche: string
  targetAudience: string
  inputType: "FROM_SCRATCH" | "FROM_COMPETITOR" | "FROM_OWN_SITE"
  sourceUrl?: string
  scanId?: string
}

export type DeployJobPayload = {
  deploymentId: string
  projectId: string
  versionId: string
  userId: string
  tier: string
  adapter: string
}

export type WebhookJobPayload = {
  webhookEventId: string
  provider: string
  eventType: string
  payload: Record<string, unknown>
}

export type EmailJobPayload = {
  to: string
  template:
    | "deploy_success"
    | "quota_alert"
    | "trial_ending"
    | "magic_link"
    | "welcome"
  data: Record<string, unknown>
}

export type DomainVerifyJobPayload = {
  customDomainId: string
  domain: string
  projectId: string
}

export type CreditResetJobPayload = {
  userId: string
  periodStart: string
  periodEnd: string
}
