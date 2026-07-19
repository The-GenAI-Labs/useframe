export const QUEUES = {
  SCAN: "scan",
  GENERATE: "generate",
  DEPLOY: "deploy",
  WEBHOOK: "webhook",
  EMAIL: "email",
  DOMAIN_VERIFY: "domainVerify",
  CREDIT_RESET: "creditReset",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
