import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { env } from "@/config/env.js"
import webhookRoute from "@/routes/webhook.route.js"
import checkoutRoute from "@/routes/checkout.route.js"
import paymentMethodRoute from "@/routes/paymentMethod.route.js"
import autoReloadRoute from "@/routes/autoReload.route.js"
import { prisma } from "@useframe/db"

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
)

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"))
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "billing",
    timestamp: new Date().toISOString(),
  })
})

// Stripe signature verification needs the raw request body, so this route
// must be mounted with express.raw() BEFORE the global express.json() below.
app.use("/", express.raw({ type: "application/json" }), webhookRoute)

app.use(express.json({ limit: "1mb" }))

app.use("/", checkoutRoute)
app.use("/", paymentMethodRoute)
app.use("/", autoReloadRoute)

app.use(
  "/{*splat}",
  (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, message: "Not found" })
  }
)

const start = async () => {
  await prisma.$connect()
  app.listen(env.PORT, () => {
    console.log(`Billing service running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error("Failed to start billing service:", err)
  process.exit(1)
})
