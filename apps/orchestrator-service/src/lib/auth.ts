import type { Request } from "express"
import jwt from "jsonwebtoken"
import { env } from "@/config/env.js"

export function verifyToken(req: Request): { id: string; email: string; plan: string } {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("No token provided")
  }
  const token = authHeader.split(" ")[1]!
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
    id: string
    email: string
    plan: string
    type: string
  }
  if (payload.type !== "access") throw new Error("Invalid token type")
  return { id: payload.id, email: payload.email, plan: payload.plan }
}
