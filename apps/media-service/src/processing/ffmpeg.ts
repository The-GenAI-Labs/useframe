import { spawn } from "node:child_process"

export type FfmpegConfig = {
  ffmpegPath: string
  ffprobePath: string
  timeoutMs: number
  threads: number
}

export const ALLOWED_DEMUXERS = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm"

// One local file per run: no network protocols, playlists, concat lists or image sequences.
export const INPUT_GUARD = ["-protocol_whitelist", "file", "-format_whitelist", ALLOWED_DEMUXERS]

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly timedOut: boolean,
  ) {
    super(message)
    this.name = "FfmpegError"
  }
}

const MAX_OUTPUT = 64 * 1024

export function runTool(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT * 16) stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_OUTPUT)
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      reject(new FfmpegError(`${command} failed to start: ${err.message}`, false))
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) reject(new FfmpegError(`${command} timed out`, true))
      else if (code !== 0) reject(new FfmpegError(`${command} exited ${code}: ${stderr.trim().slice(-500)}`, false))
      else resolve(stdout)
    })
  })
}

export function ffmpeg(config: FfmpegConfig, args: string[]): Promise<string> {
  return runTool(
    config.ffmpegPath,
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", String(config.threads), ...args],
    config.timeoutMs,
  )
}

export async function ffprobe(config: FfmpegConfig, input: string): Promise<unknown> {
  const out = await runTool(
    config.ffprobePath,
    ["-v", "error", ...INPUT_GUARD, "-print_format", "json", "-show_format", "-show_streams", "-i", input],
    config.timeoutMs,
  )
  return JSON.parse(out)
}
