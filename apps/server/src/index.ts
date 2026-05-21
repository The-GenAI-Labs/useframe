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