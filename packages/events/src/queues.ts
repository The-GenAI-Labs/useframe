export const QUEUES = {
  SCAN: "scan",
  GENERATE: "generate",
  DEPLOY: "deploy",
  WEBHOOK: "webhook",
  EMAIL: "email",
  DOMAIN_VERIFY: "domainVerify",
  CREDIT_RESET: "creditReset",
  SCORE: "score",
  SEO_AUDIT: "seoAudit",
  AUTO_RELOAD: "autoReload",
  EXPIRE_CACHE: "expireCache",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
