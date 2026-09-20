import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { env, CONFIGURED_PROVIDERS } from "@/config/env.js"
import scoreRoute from "@/routes/score.route.js"
import internalRoute from "@/routes/internal.route.js"
import { prisma } from "@useframe/db"

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
)
app.use(express.json({ limit: "15mb" }))

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"))
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "scoring",
    timestamp: new Date().toISOString(),
    providers: CONFIGURED_PROVIDERS,
  })
})

app.use("/", scoreRoute)
app.use("/internal", internalRoute)

app.use(
  "/{*splat}",
  (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, message: "Not found" })
  }
)

const start = async () => {
  await prisma.$connect()
  app.listen(env.PORT, () => {
    console.log(`Scoring service running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error("Failed to start scoring service:", err)
  process.exit(1)
})
