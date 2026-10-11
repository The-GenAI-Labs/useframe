import dotenv from "dotenv"
import { parseEnv } from "./schema.js"

dotenv.config()

const parsed = parseEnv(process.env)

if (!parsed.ok) {
  console.error("Invalid environment variables:")
  console.error(parsed.errors)
  process.exit(1)
}

export const env = parsed.env
