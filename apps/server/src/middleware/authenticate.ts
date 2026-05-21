import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { verifyAccessToken } from "@/lib/jwt.js"
import { AppError } from "@/middleware/errorHandler.js"

export const authenticate = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith("Bearer ")) {
        throw new AppError("No token provided", 401)
    }

    const token = authHeader.split(" ")[1]

    try {
        const payload = verifyAccessToken(token)

        if (payload.type !== "access") {
            throw new AppError("Invalid token type", 401)
        }

        req.user = {
            id: payload.id,
            email: payload.email,
            plan: payload.plan,
        }

        next()
    } catch (err) {
        next(err)
    }
}