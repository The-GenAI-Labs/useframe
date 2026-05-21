import type { Request, Response, NextFunction } from "express"
import type { ApiResponse } from "@/types/index.js"

export class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message)
        this.name = "AppError"
    }
}

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    console.error(`[${new Date().toISOString()}] ${err.name}: ${err.message}`)

    if (err instanceof AppError) {
        const response: ApiResponse = {
            success: false,
            message: err.message,
        }
        res.status(err.statusCode).json(response)
        return
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        res.status(401).json({ success: false, message: "Invalid token" })
        return
    }

    if (err.name === "TokenExpiredError") {
        res.status(401).json({ success: false, message: "Token expired" })
        return
    }

    // Prisma unique constraint
    if ((err as any).code === "P2002") {
        res.status(409).json({ success: false, message: "Already exists" })
        return
    }

    // fallback
    res.status(500).json({
        success: false,
        message: env.NODE_ENV === "development" ? err.message : "Internal server error",
    })
}

import { env } from "@/config/env.js"