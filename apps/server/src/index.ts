// Dev-only: this machine's Node can't verify some upstream TLS cert chains
// (Google OAuth, Upstash Redis). Disabling verification process-wide is not
// safe for production — replace with the real CA fix before deploying.
if (process.env.NODE_ENV !== "production") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

import app from "./app.js"
import { env } from "@/config/env.js"
import { prisma } from "@useframe/db"

const start = async () => {
    try {
        await prisma.$connect()
        console.log("Database connected")

        app.listen(env.PORT, () => {
            console.log(`API server running on port ${env.PORT}`)
            console.log(`   ENV: ${env.NODE_ENV}`)
        })
    } catch (err) {
        await prisma.$disconnect()
        process.exit(1)
    }
}

start()