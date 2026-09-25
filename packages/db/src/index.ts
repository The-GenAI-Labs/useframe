import dotenv from "dotenv"
import { PrismaClient, Prisma } from "../prisma/generated/client"
import { PrismaPg } from "@prisma/adapter-pg"

// This module builds its Postgres adapter from process.env.DATABASE_URL at
// import time, and it's a workspace package other services import as their
// very first line (before their own dotenv.config() call runs) — so it
// must load its own env here rather than assume a consumer already has.
dotenv.config()

export type { Prisma }

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    // Recycle connections before the DB/provider can silently drop them
    // (common with cloud Postgres idle-connection reaping), and fail
    // fast instead of hanging when the pool can't reach the DB.
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
})

export const prisma =
    globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma
}

export * from "./cache/scanCache.js"