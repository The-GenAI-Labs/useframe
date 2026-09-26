import type { Request } from "express"

export interface AuthenticatedRequest extends Request<Record<string, string>> {
    user?: {
        id: string
        email: string
        plan: string
    }
}

export interface JWTPayload {
    id: string
    email: string
    plan: string
    type: "access" | "refresh"
}

export interface ApiResponse<T = null> {
    success: boolean
    message: string
    code?: string
    data?: T
    errors?: Record<string, string[]>
}
