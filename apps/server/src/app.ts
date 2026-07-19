import express, { Request, Response, NextFunction } from "express"
import type { Express } from "express";
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { env } from "@/config/env.js"
import authRoutes from "@/modules/auth/auth.routes.js"
import projectRoutes from "@/modules/projects/projects.routes.js"
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
// only * cannot be written in new latest express version so *splat anything can be wrtien here instead of saplt
app.use("/{*splat}", (_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: "Route not found" })
})

app.use(errorHandler)

export default app