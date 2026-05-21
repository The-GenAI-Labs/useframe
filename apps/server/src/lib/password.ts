import bcrypt from "bcryptjs"
import { env } from "@/config/env.js"

export const hashPassword = async (password: string): Promise<string> => {
    const rounds = parseInt(env.BCRYPT_ROUNDS)
    return bcrypt.hash(password, rounds)
}

export const comparePassword = async (
    password: string,
    hash: string
): Promise<boolean> => {
    return bcrypt.compare(password, hash)
}