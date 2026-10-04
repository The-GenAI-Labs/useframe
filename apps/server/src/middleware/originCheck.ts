import type { Request, Response, NextFunction } from "express"
import { AppError } from "@/middleware/errorHandler.js"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

function toOrigin(value: string | undefined): string | null {
    if (!value) return null
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

// Generated sites are same-site with the API, so SameSite cookies don't stop
// them from POSTing to cookie-authenticated routes; an exact Origin match does.
export function requireAllowedOrigin(allowed: string[]) {
    const allowlist = new Set(allowed.map(toOrigin).filter((o): o is string => o !== null))

    return (req: Request, _res: Response, next: NextFunction): void => {
        if (SAFE_METHODS.has(req.method)) return next()
        const origin = toOrigin(req.get("origin") ?? req.get("referer"))
        if (!origin || !allowlist.has(origin)) {
            return next(new AppError("Origin not allowed", 403))
        }
        next()
    }
}
