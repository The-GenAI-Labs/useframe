import bcrypt from "bcryptjs"
import { stdin, stderr, stdout } from "node:process"

const ROUNDS = 12
const MIN_LENGTH = 12
// bcrypt ignores everything past 72 bytes.
const MAX_BYTES = 72

async function readPiped(): Promise<string[]> {
    let data = ""
    for await (const chunk of stdin) data += chunk
    return data.split(/\r?\n/)
}

function readHidden(prompt: string): Promise<string> {
    stderr.write(prompt)
    stdin.setRawMode(true)
    stdin.setEncoding("utf8")
    stdin.resume()
    let value = ""
    return new Promise((resolve, reject) => {
        const finish = (done: () => void) => {
            stdin.off("data", onData)
            stdin.setRawMode(false)
            stdin.pause()
            stderr.write("\n")
            done()
        }
        const onData = (chunk: string) => {
            for (const ch of chunk) {
                if (ch === "\r" || ch === "\n") return finish(() => resolve(value))
                if (ch === "\u0003") return finish(() => reject(new Error("Cancelled")))
                if (ch === "\u007f" || ch === "\b") value = [...value].slice(0, -1).join("")
                else value += ch
            }
        }
        stdin.on("data", onData)
    })
}

async function main(): Promise<void> {
    let password: string
    let confirmation: string
    if (stdin.isTTY) {
        password = await readHidden("Reviewer password: ")
        confirmation = await readHidden("Repeat password: ")
    } else {
        const lines = await readPiped()
        password = lines[0] ?? ""
        confirmation = lines[1] || password
    }

    if (password !== confirmation) throw new Error("Passwords do not match")
    if (password.length < MIN_LENGTH) throw new Error(`Use at least ${MIN_LENGTH} characters`)
    if (Buffer.byteLength(password) > MAX_BYTES) throw new Error(`Use at most ${MAX_BYTES} bytes`)

    const hash = await bcrypt.hash(password, ROUNDS)
    stderr.write("Set REVIEWER_PASSWORD_HASH in apps/server/.env, wrapped in single quotes:\n")
    stdout.write(`${hash}\n`)
}

main().catch((err: unknown) => {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
})
