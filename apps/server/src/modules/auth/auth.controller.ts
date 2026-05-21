import type { Request, Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { AuthService } from "./auth.service.js"
import type { RegisterInput, LoginInput } from "./auth.schema.js"

export const AuthController = {

    register: async (
        req: Request<{}, {}, RegisterInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const result = await AuthService.register(req.body, res)
            res.status(201).json({
                success: true,
                message: "Account created successfully",
                data: result,
            })
        } catch (err) {
            next(err)
        }
    },

    login: async (
        req: Request<{}, {}, LoginInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const result = await AuthService.login(req.body, res)
            res.status(200).json({
                success: true,
                message: "Logged in successfully",
                data: result,
            })
        } catch (err) {
            next(err)
        }
    },

    refresh: async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const refreshToken = req.cookies?.refresh_token
            const result = await AuthService.refresh(refreshToken, res)
            res.status(200).json({
                success: true,
                message: "Token refreshed",
                data: result,
            })
        } catch (err) {
            next(err)
        }
    },

    logout: async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            await AuthService.logout(res)
            res.status(200).json({
                success: true,
                message: "Logged out successfully",
            })
        } catch (err) {
            next(err)
        }
    },

    me: async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const user = await AuthService.getMe(req.user!.id)
            res.status(200).json({
                success: true,
                message: "User fetched",
                data: { user },
            })
        } catch (err) {
            next(err)
        }
    },
}