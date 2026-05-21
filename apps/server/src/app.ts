import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { env } from "@/config/env.js"
import authRoutes from "@/modules/auth/auth.routes.js"
import { errorHandler } from "@/middleware/errorHandler.js"

const app: any = express()

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

app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.use("/api/auth", authRoutes)

app.use("*", (_, res) => {
    res.status(404).json({ success: false, message: "Route not found" })
})

app.use(errorHandler)

export default app