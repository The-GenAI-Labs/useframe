import type { Request, Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"

const DAY_SECONDS = 24 * 60 * 60
const HOUR_SECONDS = 60 * 60

async function checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number = DAY_SECONDS,
    message: string = "Daily limit reached. Please try again tomorrow."
): Promise<void> {
    const count = await redis.incr(key)
    if (count === 1) {
        await redis.expire(key, windowSeconds)
    }
    if (count > limit) {
        throw new AppError(message, 429)
    }
}

export function dailyRateLimit(keyPrefix: string, limit: number) {
    return async (
        req: AuthenticatedRequest,
        _res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const userId = req.user!.id
            const key = `ratelimit:${keyPrefix}:${userId}:${new Date().toISOString().slice(0, 10)}`
            await checkAndIncrement(key, limit)
            next()
        } catch (err) {
            next(err)
        }
    }
}

export function dailyRateLimitByIp(keyPrefix: string, limit: number) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const ip = req.ip ?? "unknown"
            const key = `ratelimit:${keyPrefix}:${ip}:${new Date().toISOString().slice(0, 10)}`
            await checkAndIncrement(key, limit)
            next()
        } catch (err) {
            next(err)
        }
    }
}

export function hourlyRateLimit(keyPrefix: string, limit: number) {
    return async (
        req: AuthenticatedRequest,
        _res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const userId = req.user!.id
            const key = `ratelimit:${keyPrefix}:${userId}:${new Date().toISOString().slice(0, 13)}`
            await checkAndIncrement(
                key,
                limit,
                HOUR_SECONDS,
                "Hourly limit reached. Please try again later."
            )
            next()
        } catch (err) {
            next(err)
        }
    }
}
