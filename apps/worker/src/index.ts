import { prisma } from "@useframe/db"
import { startScanWorker } from "./processors/scan.processor.js"
import { startScoreWorker } from "./processors/score.processor.js"
import { startSeoAuditWorker } from "./processors/seoAudit.processor.js"
import { startDeployWorker } from "./processors/deploy.processor.js"
import { startWebhookWorker } from "./processors/webhook.processor.js"
import { startAutoReloadWorker } from "./processors/autoReload.processor.js"
import { startDomainVerifyWorker } from "./processors/domainVerify.processor.js"
import { startExpireCacheWorker } from "./processors/expireCache.processor.js"

async function main() {
  await prisma.$connect()
  console.log("[worker] Database connected")

  const scanWorker = startScanWorker()
  console.log("[worker] Scan worker started")

  const scoreWorker = startScoreWorker()
  console.log("[worker] Score worker started")

  const seoAuditWorker = startSeoAuditWorker()
  console.log("[worker] SEO audit worker started")

  const deployWorker = startDeployWorker()
  console.log("[worker] Deploy worker started")

  const webhookWorker = startWebhookWorker()
  console.log("[worker] Webhook worker started")

  const autoReloadWorker = startAutoReloadWorker()
  console.log("[worker] Auto-reload worker started")

  const domainVerifyWorker = startDomainVerifyWorker()
  console.log("[worker] Domain verify worker started")

  const expireCacheWorker = startExpireCacheWorker()
  console.log("[worker] Expire cache worker started")

  const shutdown = async () => {
    console.log("[worker] Shutting down...")
    await scanWorker.close()
    await scoreWorker.close()
    await seoAuditWorker.close()
    await deployWorker.close()
    await webhookWorker.close()
    await autoReloadWorker.close()
    await domainVerifyWorker.close()
    await expireCacheWorker.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err)
  process.exit(1)
})
