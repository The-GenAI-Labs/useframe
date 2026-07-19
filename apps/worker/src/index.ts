import { prisma } from "@useframe/db"
import { startScanWorker } from "./processors/scan.processor.js"

async function main() {
  await prisma.$connect()
  console.log("[worker] Database connected")

  const scanWorker = startScanWorker()
  console.log("[worker] Scan worker started")

  const shutdown = async () => {
    console.log("[worker] Shutting down...")
    await scanWorker.close()
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
