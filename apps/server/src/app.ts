import express, { Request, Response, NextFunction } from "express"
import type { Express } from "express";
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { env } from "@/config/env.js"
import authRoutes from "@/modules/auth/auth.routes.js"
import projectRoutes from "@/modules/projects/projects.routes.js"
import chatRoutes from "@/modules/chat/chat.routes.js"
import scoreRoutes from "@/modules/score/score.routes.js"
import seoRoutes from "@/modules/seo/seo.routes.js"
import billingRoutes from "@/modules/billing/billing.routes.js"
import creditsRoutes from "@/modules/credits/credits.routes.js"
import findingsRoutes from "@/modules/findings/findings.routes.js"
import generateRoutes from "@/modules/generate/generate.routes.js"
import researchDocumentRoutes from "@/modules/plan/researchDocument.routes.js"
import { errorHandler } from "@/middleware/errorHandler.js"

const app: Express = express()

app.use(helmet())
app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true,
}))

app.use(express.json({ limit: "10kb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

if (env.NODE_ENV === "development") {
    app.use(morgan("dev"))
}

app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.use("/api/auth", authRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/chat", chatRoutes)
app.use("/api/score", scoreRoutes)
app.use("/api/seo", seoRoutes)
app.use("/api/billing", billingRoutes)
app.use("/api/credits", creditsRoutes)
app.use("/api/findings", findingsRoutes)
app.use("/api/generate", generateRoutes)
app.use("/api/research-documents", researchDocumentRoutes)
app.use("/{*splat}", (_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: "Route not found" })
})

app.use(errorHandler)

export default app