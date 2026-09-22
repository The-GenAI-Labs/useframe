export type ScanJobPayload = {
  scanId: string
  userId: string
  projectId: string
  sourceUrl: string
  scanType: "COMPETITOR" | "OWN_SITE"
  // Discovery order from findCompetitorUrls. Only rank 0 (the top-ranked
  // competitor) gets the expensive video-recording + vision-analysis path;
  // the rest keep the cheap screenshot + design-token path. Optional so
  // existing enqueue call sites stay valid.
  rank?: number
}

export type ResearchPdfJobPayload = {
  projectId: string
  userId: string
  // Which reports to render. COMPETITOR_ANALYSIS is only enqueued when the
  // project actually has scans to report on.
  sections: ("COMPETITOR_ANALYSIS" | "RESEARCH_RATIONALE")[]
  // Where the resulting attachment message is posted.
  conversationId: string
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
    | "auto_reload_failed"
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

export type ScoreJobPayload = {
  scoreId: string
  url: string
}

export type SeoAuditJobPayload = {
  seoAuditId: string
  url: string
  tier: "free" | "paid"
}

export type AutoReloadJobPayload = {
  userId: string
  topUpToCents: number
}
