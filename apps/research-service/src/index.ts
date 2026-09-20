import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { env } from "@/config/env.js"
import retrieveRoute from "@/routes/retrieve.route.js"
import domainPatternRoute from "@/routes/domainPattern.route.js"
import audienceModifierRoute from "@/routes/audienceModifier.route.js"
import findingRoute from "@/routes/finding.route.js"
import { prisma } from "@useframe/db"

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
)
app.use(express.json({ limit: "1mb" }))

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"))
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "research",
    mock: env.RESEARCH_MOCK,
    timestamp: new Date().toISOString(),
  })
})

app.use("/", retrieveRoute)
app.use("/", domainPatternRoute)
app.use("/", audienceModifierRoute)
app.use("/", findingRoute)

app.use(
  "/{*splat}",
  (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, message: "Not found" })
  }
)

const start = async () => {
  await prisma.$connect()
  app.listen(env.PORT, () => {
    console.log(`Research service running on port ${env.PORT} (mock=${env.RESEARCH_MOCK})`)
  })
}

start().catch((err) => {
  console.error("Failed to start research service:", err)
  process.exit(1)
})
