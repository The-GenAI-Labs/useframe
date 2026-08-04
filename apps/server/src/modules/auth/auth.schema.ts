import { z } from "zod"

export const registerSchema = z.object({
    name: z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(50, "Name must be at most 50 characters")
        .trim(),

    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),

    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(72, "Password must be at most 72 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
})

export const loginSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),

    password: z
        .string()
        .min(1, "Password is required"),
})

export const refreshSchema = z.object({
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>