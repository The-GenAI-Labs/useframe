import { PrismaClient } from "../prisma/generated/client"
import { PrismaPg } from "@prisma/adapter-pg"

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