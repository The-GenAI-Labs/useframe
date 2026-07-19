import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { env, CONFIGURED_PROVIDERS } from "@/config/env.js"
import generateRoute from "@/routes/generate.route.js"
import { MODELS } from "@/llm/providers.js"
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
  const availableModels = MODELS.filter(
    (m) => CONFIGURED_PROVIDERS[m.provider],
  )
  res.json({
    status: "ok",
    service: "orchestrator",
    timestamp: new Date().toISOString(),
    providers: CONFIGURED_PROVIDERS,
    availableModels: availableModels.map((m) => m.id),
  })
})

app.use("/", generateRoute)

app.use(
  "/{*splat}",
  (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, message: "Not found" })
  }
)

const start = async () => {
  await prisma.$connect()
  app.listen(env.PORT, () => {
    console.log(`Orchestrator service running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error("Failed to start orchestrator:", err)
  process.exit(1)
})
